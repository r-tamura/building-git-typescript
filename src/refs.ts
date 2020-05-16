import * as path from "path";
import { FileService, defaultFs, exists } from "./services";
import { OID } from "./types";
import { BaseError } from "./util";
import { Lockfile, MissingParent } from "./lockfile";
import { Pathname } from "./types";

type Environment = {
  fs?: FileService;
};

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

type SymRef = {
  type: "symref";
  path: string;
};

type Ref = {
  type: "ref";
  oid: OID;
};

const SYMREF = /^ref: (.+)$/;

export class LockDenied extends BaseError {}
export class InvalidBranch extends BaseError {}
export class Refs {
  #pathname: Pathname;
  #refspath: Pathname;
  #headspath: Pathname;
  #fs: FileService;
  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname;
    this.#refspath = path.join(pathname, "refs");
    this.#headspath = path.join(this.#refspath, "heads");
    this.#fs = env.fs ?? defaultFs;
  }

  async createBranch(branchName: string, startOid: string) {
    const pathname = path.join(this.#headspath, branchName);

    if (INVALID_BRANCH_NAME.some((r) => r.test(branchName))) {
      throw new InvalidBranch(`'${branchName}' is not valid branch name.`);
    }

    if (await exists(this.#fs, pathname)) {
      throw new InvalidBranch(`A branch named '${branchName}' already exists.`);
    }

    await this.updateRefFile(pathname, startOid);
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
    await this.updateRefFile(this.headPath, oid);
  }

  private async updateRefFile(
    pathname: Pathname,
    oid: OID,
    retry: number | null = null
  ) {
    try {
      const lockfile = new Lockfile(pathname, { fs: this.#fs });

      await lockfile.holdForUpdate();

      await lockfile.write(oid);
      await lockfile.write("\n");
      await lockfile.commit();
    } catch (e) {
      switch (e.constructor) {
        case MissingParent:
          // リトライ回数: 1
          if (retry === 0) {
            throw e;
          }
          await this.#fs.mkdir(path.dirname(pathname), { recursive: true });
          await this.updateRefFile(pathname, oid, retry ? retry - 1 : 1);
          break;
        default:
          throw e;
      }
    }
  }

  /**
   * HEADのデータを読み込みます。HEADファイルが存在しない場合はnullを返します。
   */
  async readHead() {
    // try {
    //   const ref = await this.#fs.readFile(this.headPath, "ascii");
    //   return ref.trim();
    // } catch (e) {
    //   const nodeErr = e as NodeJS.ErrnoException;
    //   if (nodeErr.code === "ENOENT") {
    //     return null;
    //   } else {
    //     throw e;
    //   }
    // }
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
    return match
      ? { type: "symref", path: match[1] }
      : { type: "ref", oid: data };
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

  private get headPath() {
    return path.join(this.#pathname, HEAD);
  }

  private async pathForName(name: string) {
    const prefixies = [this.#pathname, this.#refspath, this.#headspath];
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

  private async readRefFile(pathname: Pathname) {
    try {
      const content = await this.#fs.readFile(pathname, "utf-8");
      return content.trim();
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        return null;
      } else {
        throw e;
      }
    }
  }
}
