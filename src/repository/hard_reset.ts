import { Stats } from "fs";
import { Blob } from "../database";
import { OID, Pathname } from "../types";
import { posixPath } from "../util/fs";
import { Repository } from "./repository";
import { Status } from "./status";

export class HardReset {
  #repo: Repository;
  #status!: Status;
  #oid: OID;

  constructor(repo: Repository, oid: OID) {
    this.#repo = repo;
    this.#oid = oid;
  }

  async execute() {
    this.#status = await this.#repo.status(this.#oid);
    const changed = this.#status.changed;
    for (const pathname of changed) {
      await this.resetPath(pathname);
    }
  }

  async resetPath(pathname: Pathname) {
    const pPath = posixPath(pathname);
    await this.#repo.index.remove(pPath);
    await this.#repo.workspace.remove(pPath);

    const entry = this.#status.headTree[pPath];

    if (!entry) {
      return;
    }

    // ファイルパスから読み込んだオブジェクトは全てファイル(blob)のみ
    const blob = (await this.#repo.database.load(entry.oid)) as Blob;
    await this.#repo.workspace.writeFile(pPath, blob.data.toString(), {
      mode: entry.mode,
      mkdir: true,
    });

    // エントリが存在するので、ファイルも存在する
    const stat = (await this.#repo.workspace.statFile(pPath)) as Stats;
    this.#repo.index.add(pPath, entry.oid, stat);
  }
}
