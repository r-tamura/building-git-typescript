import * as os from "os";
import * as path from "path";
import { Lockfile, MissingParent } from "./lockfile";
import { defaultFs, directory, exists, FileService } from "./services";
import { Nullable, OID, Pathname } from "./types";
import { ascendUnix, asserts, BaseError, find, PosixPath } from "./util";
import { posixJoin, posixPath, toOsPath } from "./util/fs";
import { nullify } from "./util/logic";

export interface Environment {
  fs?: FileService;
}
interface UpdateReFileOptions {
  retry?: Nullable<number>;
  /** lockfile作成時に実行される関数 */
  onLockfileCreated?: () => Promise<void>;
}

const INVALID_BRANCH_NAME_PATTERNS = [
  /^\./, // Unixの隠しファイルパスの形式
  /\/\./, // Unixの隠しファイルパスの形式
  /\.\./, // Gitの..オペレータ or Unixの親ディレクトリの形式
  /\/$/, // Unixのディレクトリ名の形式
  /\.lock$/, // .lockファイルの形式
  /@\{/, // Gitの形式の一つ
  // eslint-disable-next-line
  /[\x00-\x20*~?:\[\\^~\x7f]+/, // ASCII制御文字
];

const HEAD = "HEAD";
export const ORIG_HEAD = "ORIG_HEAD";

export const symref = (refs: Refs, p: Pathname): SymRef => SymRef.of(refs, p);
export interface SymRef {
  type: "symref";
  path: string;
  shortName(): string;
  readOid(): Promise<string>;
  ord(other: SymRef): number;
  head(): boolean;
  /** Symbolic Refがローカルブランチであるかを判定します */
  branch(): boolean;
  /** Symbolic Refがリモートブランチであるかを判定します */
  remote(): boolean;
}

/**
 * Symbolic Ref
 *
 * https://git-scm.com/docs/git-symbolic-ref
 * > A symbolic ref is a regular file that stores a string that begins with ref: refs/.
 * > For example, your .git/HEAD is a regular file whose contents is ref: refs/heads/master.
 */
export class SymRef {
  path: string;
  type = "symref" as const;
  #refs: Refs;
  constructor(refs: Refs, path: Pathname) {
    this.#refs = refs;
    this.path = path;
  }
  static of(refs: Refs, p: Pathname) {
    const symref = new SymRef(refs, p);
    return symref;
  }

  head() {
    return this.path === HEAD;
  }

  shortName() {
    return this.#refs.shortName(this.path);
  }

  readOid() {
    return this.#refs.readRef(this.path);
  }

  ord(other: SymRef) {
    return this.path.localeCompare(other.path);
  }

  branch(): boolean {
    return this.path.startsWith(path.join("refs", "heads") + path.sep);
  }

  remote(): boolean {
    return this.path.startsWith(path.join("refs", "remotes") + path.sep);
  }
}

const ref = (oid: OID): Ref => Ref.of(oid);
export interface Ref {
  type: "ref";
  oid: OID;
  readOid(): Promise<string>;
}

export class Ref {
  type = "ref" as const;
  constructor(public oid: OID) {}
  static of(oid: OID) {
    const ref = new Ref(oid);
    return ref;
  }

  async readOid() {
    return this.oid;
  }
}

// Gitリファレンスのパターン
const SYMREF_PATTERN = /^ref: (.+)$/;

export const REFS_DIR = "refs";
export const HEADS_DIR = posixJoin(REFS_DIR, "heads");
export const REMOTES_DIR = posixJoin(REFS_DIR, "remotes");

export class LockDenied extends BaseError {}
export class InvalidBranch extends BaseError {}
export class StaleValue extends BaseError {}
export class Refs {
  #pathname: PosixPath;
  #refsPath: PosixPath;
  #headsPath: PosixPath;
  #remotesPath: PosixPath;
  #fs: FileService;
  constructor(pathname: Pathname, env: Environment = {}) {
    this.#pathname = posixPath(pathname);
    this.#refsPath = posixJoin(this.#pathname, REFS_DIR);
    this.#headsPath = posixJoin(this.#pathname, HEADS_DIR);
    this.#remotesPath = posixJoin(this.#pathname, REMOTES_DIR);
    this.#fs = env.fs ?? defaultFs;
  }

  async createBranch(branchName: string, startOid: string) {
    const pathname = posixJoin(this.#headsPath, branchName);

    if (INVALID_BRANCH_NAME_PATTERNS.some((r) => r.test(branchName))) {
      throw new InvalidBranch(`'${branchName}' is not a valid branch name.`);
    }

    if (await exists(this.#fs, toOsPath(pathname))) {
      throw new InvalidBranch(`A branch named '${branchName}' already exists.`);
    }

    await this.updateRefFile(pathname, startOid);
  }

  /**
   * 指定されたソースが指しているrefを取得します。detached状態のときはコミットIDを取得します。
   * ソースが指定されないときはHEADが参照しているrefを取得します。
   */
  async currentRef(source: string = HEAD): Promise<SymRef> {
    const ref = await this.readOidOrSymRef(posixJoin(this.#pathname, source));

    switch (ref?.type) {
      case "symref":
        return this.currentRef(ref.path);
      case "ref":
      case undefined:
        return symref(this, source);
    }
  }

  async deleteBranch(branchName: string) {
    const pathname = posixJoin(this.#headsPath, branchName);
    const lockfile = new Lockfile(pathname);
    await lockfile.holdForUpdate();

    let oid;
    try {
      oid = await this.readSymRef(pathname);
      if (oid === null) {
        throw new InvalidBranch(`branch '${branchName}' not found.`);
      }
      await this.#fs.unlink(toOsPath(pathname));
    } finally {
      await lockfile.rollback();
    }
    await this.deleteParentDirectories(pathname);
    return oid;
  }

  async reverseRefs() {
    const table: Map<string, SymRef[]> = new Map();

    const allRefs = await this.listAllRefs();
    for (const ref of allRefs) {
      const oid = await ref.readOid();
      if (oid) {
        if (!table.has(oid)) {
          table.set(oid, []);
        }
        const refs = table.get(oid);
        asserts(typeof refs !== "undefined");
        refs.push(ref);
      }
    }
    return table;
  }

  async setHead(revision: string, oid: OID) {
    const head = posixJoin(this.#pathname, HEAD);
    const headpath = posixJoin(this.#headsPath, revision);

    if (await exists(this.#fs, toOsPath(headpath))) {
      const relative = posixPath(path.relative(this.#pathname, headpath));
      await this.updateRefFile(head, `ref: ${relative}`);
    } else {
      await this.updateRefFile(head, oid);
    }
  }

  /**
   * HEADを更新します
   * HEADが他のプロセスと競合した場合 LockDenied エラーの例外を投げます
   * @param oid オブジェクトID
   */
  async updateHead(oid: OID) {
    return this.updateSymRef(this.headPath, oid);
  }

  /**
   * HEADをSymbolic Refで更新します
   * @param ref
   * @example
   * ```ts
   * const refs = new Refs("/path/to/repo/.git");
   */
  async setHeadSymRef(ref: PosixPath) {
    const headContent = `ref: ${ref}`;
    return this.updateHead(headContent);
  }

  /**
   * 指定された名前のrefのオブジェクトIDを更新します
   * @param name ref名
   * @param oid オブジェクトID
   */
  async updateRef(name: string, oid: Nullable<OID>): Promise<void> {
    return this.updateRefFile(
      posixJoin(this.#pathname, name),
      oid === null ? undefined : oid,
    );
  }

  /**
   * ファイルシステム上にあるOIDが変更前OIDと一致した場合、新しいOIDへアトミックに変更します
   *
   * @param name ref名
   * @param oldOid
   * @param newOid
   */
  async compareAndSwap(
    name: string,
    oldOid: OID | undefined,
    newOid: OID | undefined,
  ): Promise<void> {
    const refpath = posixJoin(this.#pathname, name);
    await this.updateRefFile(refpath, newOid, {
      onLockfileCreated: async () => {
        const currentOid = await this.readSymRef(refpath);
        if (nullify(oldOid) !== currentOid) {
          throw new StaleValue(`value of ${name} changed since last read`);
        }
      },
    });
  }

  private async updateRefFile(
    pathname: PosixPath,
    oid: OID | undefined,
    { retry = null, onLockfileCreated }: UpdateReFileOptions = {},
  ): Promise<void> {
    let lockfile;
    try {
      lockfile = new Lockfile(pathname, { fs: this.#fs });
      await lockfile.holdForUpdate();

      if (onLockfileCreated) {
        await onLockfileCreated();
      }

      if (oid !== undefined) {
        await this.writeLockfile(lockfile, oid);
      } else {
        await this.#fs.unlink(toOsPath(pathname)).catch((e: NodeJS.ErrnoException) => {
          if (e.code === "ENOENT") {
            return;
          }
          throw e;
        });
        await lockfile.rollback();
      }
    } catch (e) {
      asserts(e instanceof Error);
      switch (e.constructor) {
        case MissingParent: {
          // リトライ回数: 1
          if (retry === 0) {
            await lockfile?.rollback();
            throw e;
          }
          const dirPath = toOsPath(path.dirname(pathname));
          await this.#fs.mkdir(dirPath, { recursive: true });
          await this.updateRefFile(pathname, oid, {
            retry: retry ? retry - 1 : 1,
          });
          break;
        }
        default:
          await lockfile?.rollback();
          throw e;
      }
    }
  }

  private async deleteParentDirectories(pathname: PosixPath) {
    for (const dirname of ascendUnix(path.posix.dirname(pathname))) {
      if (dirname === this.headPath) {
        break;
      }

      const e = await this.#fs
        .rm(toOsPath(dirname))
        .catch((e: NodeJS.ErrnoException) => e);

      if (e && e.code === "ENOTEMPTY") {
        break;
      }
    }
  }

  private async updateSymRef(
    pathname: PosixPath,
    oid: OID,
  ): Promise<string | null> {
    const lockfile = new Lockfile(pathname);
    await lockfile.holdForUpdate();
    const ref = await this.readOidOrSymRef(pathname);

    if (ref === null || ref.type !== "symref") {
      await this.writeLockfile(lockfile, oid);
      return ref?.oid ?? null;
    }

    try {
      return this.updateSymRef(posixJoin(this.#pathname, ref.path), oid);
    } finally {
      await lockfile.rollback();
    }
  }

  private async writeLockfile(lockfile: Lockfile, oid: OID) {
    await lockfile.write(oid);
    await lockfile.write(os.EOL);
    await lockfile.commit();
  }

  /**
   * HEADのデータを読み込みます。HEADファイルが存在しない場合はnullを返します。
   */
  async readHead(): Promise<string | null> {
    return this.readSymRef(posixJoin(this.#pathname, HEAD));
  }

  /**
   *  Refファイルを読み取り、ファイルの形式によりOIDもしくはsymrefを返します。
   *  ファイルが存在しない時は、nullを返します。
   *  @pathname refファイルパス
   */
  async readOidOrSymRef(pathname: PosixPath): Promise<SymRef | Ref | null> {
    let data: string;
    try {
      data = await this.#fs.readFile(toOsPath(pathname), "utf-8").then((s) => s.trim());
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case "ENOENT":
          return null;
        default:
          throw e;
      }
    }
    const match = SYMREF_PATTERN.exec(data);
    return match ? symref(this, match[1]) : ref(data);
  }

  async readRef(name: string) {
    const pathname = await this.pathForName(name);
    return pathname ? this.readSymRef(pathname) : null;
  }

  async readSymRef(name: string): Promise<OID | null> {
    const ref = await this.readOidOrSymRef(posixPath(name));
    switch (ref?.type) {
      case "symref":
        return this.readSymRef(posixJoin(this.#pathname, ref.path));
      case "ref":
        return ref.oid;
      default:
        return null;
    }
  }

  shortName(pathname: string): string {
    const fullPath = posixJoin(this.#pathname, pathname);
    const prefix = find(
      [this.#remotesPath, this.#headsPath, this.#pathname],
      (dir) => {
        return ascendUnix(path.dirname(fullPath)).some((parent) => parent === dir);
      },
    );
    asserts(prefix != null, "nullありあえない");
    return posixPath(path.relative(prefix, fullPath));
  }

  async longName(ref: string): Promise<string> {
    const pathname = await this.pathForName(ref);
    if (pathname) {
      return posixPath(path.relative(this.#pathname, pathname));
    }

    throw new InvalidBranch(
      `the requested upstream branch '${ref}' does not exist`,
    );
  }

  /**
   * HEADを含めた全てのrefのリストを取得します
   */
  async listAllRefs(): Promise<SymRef[]> {
    const head = symref(this, HEAD);
    const result = [head, ...(await this.listRefs(this.#refsPath))];
    return result;
  }

  async listBranches(): Promise<SymRef[]> {
    return await this.listRefs(this.#headsPath);
  }

  async listRemotes(): Promise<SymRef[]> {
    return await this.listRefs(this.#remotesPath);
  }

  private get headPath() {
    return posixJoin(this.#pathname, HEAD);
  }

  /**
   * 指定されたディレクトリないの全てのrefのリストを取得します
   * @param dirname refsディレクトリ
   */
  private async listRefs(dirname: PosixPath): Promise<SymRef[]> {
    const EXCLUDE_DIRS = [".", ".."];
    let names;
    try {
      names = await this.#fs
        .readdir(toOsPath(dirname))
        .then((names) => names.filter((name) => !EXCLUDE_DIRS.includes(name)));
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case "ENOENT":
          return [];
        default:
          throw e;
      }
    }

    const pathnames = names.map((name) => posixPath(path.join(dirname, name)));

    const symrefs: (SymRef | SymRef[])[] = [];
    for (const pathname of pathnames) {
      if (await directory(this.#fs, toOsPath(pathname))) {
        symrefs.push(await this.listRefs(pathname));
      } else {
        const relative = posixPath(path.relative(this.#pathname, pathname));
        symrefs.push(symref(this, relative));
      }
    }
    return symrefs.flat();
  }

  private async pathForName(name: string) {
    const prefixies = [
      this.#pathname,
      this.#refsPath,
      this.#headsPath,
      this.#remotesPath,
    ];
    let prefix = null;
    for (const candidatePrefix of prefixies) {
      const candidate = posixJoin(candidatePrefix, name);
      const exist = await exists(this.#fs, toOsPath(candidate));
      if (exist) {
        prefix = candidate;
        break;
      }
    }
    return prefix;
  }
}
