import * as os from "os";
import * as path from "path";
import { Lockfile, MissingParent } from "./lockfile";
import { defaultFs, directory, exists, FileService } from "./services";
import { Nullable, OID, Pathname } from "./types";
import { ascend, asserts, BaseError, find } from "./util";
import { nullify } from "./util/logic";

export interface Environment {
  fs?: FileService;
}
interface UpdateReFileOptions {
  retry?: Nullable<number>;
  /** lockfile作成時に実行される関数 */
  onLockfileCreated?: () => Promise<void>;
}

const INVALID_BRANCH_NAME = [
  /^\./, // Unixの隠しファイルパスの形式
  /\/\./, // Unixの隠しファイルパスの形式
  /\.\./, // Gitの..オペレータ or Unixの親ディレクトリの形式
  /\/$/, // Unixのディレクトリ名の形式
  /\.lock$/, // .lockファイルの形式
  /@\{/, // Gitの形式の一つ
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
}

export class SymRef {
  type = "symref" as const;
  #refs: Refs;
  constructor(refs: Refs, public path: Pathname) {
    this.#refs = refs;
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

const SYMREF = /^ref: (.+)$/;

export const REFS_DIR = "refs";
export const HEADS_DIR = path.join(REFS_DIR, "heads");
export const REMOTES_DIR = path.join(REFS_DIR, "remotes");

export class LockDenied extends BaseError {}
export class InvalidBranch extends BaseError {}
export class StaleValue extends BaseError {}
export class Refs {
  #pathname: Pathname;
  #refspath: Pathname;
  #headspath: Pathname;
  #remotesPath: Pathname;
  #fs: FileService;
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#refspath = path.join(pathname, REFS_DIR);
    this.#headspath = path.join(pathname, HEADS_DIR);
    this.#remotesPath = path.join(pathname, REMOTES_DIR);
    this.#fs = env.fs ?? defaultFs;
  }

  async createBranch(branchName: string, startOid: string) {
    const pathname = path.join(this.#headspath, branchName);

    if (INVALID_BRANCH_NAME.some((r) => r.test(branchName))) {
      throw new InvalidBranch(`'${branchName}' is not a valid branch name.`);
    }

    if (await exists(this.#fs, pathname)) {
      throw new InvalidBranch(`A branch named '${branchName}' already exists.`);
    }

    await this.updateRefFile(pathname, startOid);
  }

  /**
   * ソースが指しているrefを取得します。detached状態のときはコミットIDを取得します。
   * ソースが指定されないときはHEADが参照しているrefを取得します。
   */
  async currentRef(source: string = HEAD): Promise<SymRef> {
    const ref = await this.readOidOrSymRef(path.join(this.#pathname, source));

    switch (ref?.type) {
      case "symref":
        return this.currentRef(ref.path);
      case "ref":
      case undefined:
        return symref(this, source);
    }
  }

  async deleteBranch(branchName: string) {
    const pathname = path.join(this.#headspath, branchName);
    const lockfile = new Lockfile(pathname);
    await lockfile.holdForUpdate();

    let oid;
    try {
      oid = await this.readSymRef(pathname);
      if (oid === null) {
        throw new InvalidBranch(`branch '${branchName}' not found.`);
      }
      await this.#fs.unlink(pathname);
    } finally {
      await lockfile.rollback();
    }
    await this.deleteParentDirectories(pathname);
    return oid;
  }

  async listBranchs() {
    return this.listRefs(this.#headspath);
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
    const head = path.join(this.#pathname, HEAD);
    const headpath = path.join(this.#headspath, revision);

    if (await exists(this.#fs, headpath)) {
      const relative = path.relative(this.#pathname, headpath);
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
   * 指定された名前のrefのオブジェクトIDを更新します
   * @param name ref名
   * @param oid オブジェクトID
   */
  async updateRef(name: string, oid: Nullable<OID>): Promise<void> {
    return this.updateRefFile(
      path.join(this.#pathname, name),
      oid === null ? undefined : oid
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
    newOid: OID | undefined
  ): Promise<void> {
    const refpath = path.join(this.#pathname, name);
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
    pathname: Pathname,
    oid: OID | undefined,
    { retry = null, onLockfileCreated }: UpdateReFileOptions = {}
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
        await this.#fs.unlink(pathname).catch((e: NodeJS.ErrnoException) => {
          if (e.code === "ENOENT") {
            return;
          }
          throw e;
        });
        await lockfile.rollback();
      }
    } catch (e) {
      switch (e.constructor) {
        case MissingParent:
          // リトライ回数: 1
          if (retry === 0) {
            await lockfile?.rollback();
            throw e;
          }
          await this.#fs.mkdir(path.dirname(pathname), { recursive: true });
          await this.updateRefFile(pathname, oid, {
            retry: retry ? retry - 1 : 1,
          });
          break;
        default:
          await lockfile?.rollback();
          throw e;
      }
    }
  }

  private async deleteParentDirectories(pathname: Pathname) {
    for (const dirname of ascend(path.dirname(pathname))) {
      if (dirname === this.headPath) {
        break;
      }

      const e = await this.#fs
        .rmdir(dirname)
        .catch((e: NodeJS.ErrnoException) => e);

      if (e && e.code === "ENOTEMPTY") {
        break;
      }
    }
  }

  private async updateSymRef(
    pathname: Pathname,
    oid: OID
  ): Promise<Nullable<string>> {
    const lockfile = new Lockfile(pathname);
    await lockfile.holdForUpdate();
    const ref = await this.readOidOrSymRef(pathname);

    if (ref === null || ref.type !== "symref") {
      await this.writeLockfile(lockfile, oid);
      return ref?.oid ?? null;
    }

    try {
      return this.updateSymRef(path.join(this.#pathname, ref.path), oid);
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
  async readHead() {
    return this.readSymRef(path.join(this.#pathname, HEAD));
  }

  /**
   *  Refファイルを読み取り、ファイルの形式によりOIDもしくはsymrefを返します。
   *  ファイルが存在しない時は、nullを返します。
   *  @pathname refファイルパス
   */
  async readOidOrSymRef(pathname: Pathname): Promise<SymRef | Ref | null> {
    let data: string;
    try {
      data = await this.#fs.readFile(pathname, "utf-8").then((s) => s.trim());
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      switch (nodeErr.code) {
        case "ENOENT":
          return null;
        default:
          throw e;
      }
    }
    const match = SYMREF.exec(data);
    return match ? symref(this, match[1]) : ref(data);
  }

  async readRef(name: string) {
    const pathname = await this.pathForName(name);
    return pathname ? this.readSymRef(pathname) : null;
  }

  async readSymRef(name: string): Promise<OID | null> {
    const ref = await this.readOidOrSymRef(name);
    switch (ref?.type) {
      case "symref":
        return this.readSymRef(path.join(this.#pathname, ref.path));
      case "ref":
        return ref.oid;
      default:
        return null;
    }
  }

  shortName(pathname: Pathname) {
    const fullpath = path.join(this.#pathname, pathname);
    const prefix = find(
      [this.#remotesPath, this.#headspath, this.#pathname],
      (dir) => {
        return ascend(path.dirname(fullpath)).some((parent) => parent === dir);
      }
    );
    asserts(prefix !== null);
    return path.relative(prefix, fullpath);
  }

  /**
   * HEADを含めた全てのrefのリストを取得します
   */
  async listAllRefs(): Promise<SymRef[]> {
    const head = symref(this, HEAD);
    const result = [head, ...(await this.listRefs(this.#refspath))];
    return result;
  }

  private get headPath() {
    return path.join(this.#pathname, HEAD);
  }

  /**
   * 指定されたディレクトリないの全てのrefのリストを取得します
   * @param dirname refsディレクトリ
   */
  private async listRefs(dirname: Pathname): Promise<SymRef[]> {
    const EXCLUDE_DIRS = [".", ".."];
    let names;
    try {
      names = await this.#fs
        .readdir(dirname)
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

    const pathnames = names.map((name) => path.join(dirname, name));

    const symrefs: (SymRef | SymRef[])[] = [];
    for (const pathname of pathnames) {
      if (await directory(this.#fs, pathname)) {
        symrefs.push(await this.listRefs(pathname));
      } else {
        const relative = path.relative(this.#pathname, pathname);
        symrefs.push(symref(this, relative));
      }
    }
    return symrefs.flat();
  }

  private async pathForName(name: string) {
    const prefixies = [
      this.#pathname,
      this.#refspath,
      this.#headspath,
      this.#remotesPath,
    ];
    let prefix = null;
    for (const candidatePrefix of prefixies) {
      const candidate = path.join(candidatePrefix, name);
      const exist = await exists(this.#fs, candidate);
      if (exist) {
        prefix = candidate;
        break;
      }
    }
    return prefix;
  }
}
