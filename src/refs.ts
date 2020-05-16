import * as path from "path";
import { FileService, defaultFs, exists } from "./services";
import { OID } from "./types";
import { BaseError, asserts } from "./util";
import { Lockfile, MissingParent } from "./lockfile";
import { Pathname } from "./types";
import { MissingFile } from "./workspace";

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
  /[^ -~]+/, // ASCII制御文字 https://stackoverflow.com/questions/24229262/match-non-printable-non-ascii-characters-and-remove-from-text
];

const HEAD = "HEAD";

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

  async createBranch(branchName: string) {
    const pathname = path.join(this.#headspath, branchName);

    if (INVALID_BRANCH_NAME.some((r) => r.test(branchName))) {
      throw new InvalidBranch(`'${branchName}' is not valid branch name.`);
    }

    if (await exists(this.#fs, pathname)) {
      throw new InvalidBranch(`A branch named '${branchName}' already exists.`);
    }

    const head = await this.readHead();
    asserts(head !== null);
    await this.updateRefFile(pathname, head);
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
    try {
      const ref = await this.#fs.readFile(this.headPath, { encoding: "ascii" });
      return ref.trim();
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        return null;
      } else {
        throw e;
      }
    }
  }

  private get headPath() {
    return path.join(this.#pathname, HEAD);
  }
}
