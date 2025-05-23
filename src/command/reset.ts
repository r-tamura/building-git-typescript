import * as arg from "arg";
import { ORIG_HEAD } from "../refs";
import { HEAD, InvalidObject, Revision } from "../revision";
import { OID, Pathname } from "../types";
import { isempty } from "../util/array";
import { asserts } from "../util/assert";
import { posixPath } from "../util/fs";
import { BaseCommand } from "./base";

/** resetモード */
type Mode = "soft" | "mixed" | "hard";

interface Options {
  mode: Mode;
}

export class Reset extends BaseCommand<Options> {
  #commitOid!: OID;

  async run() {
    await this.selectCommitId();

    await this.repo.index.loadForUpdate();
    await this.resetFiles();
    await this.repo.index.writeUpdates();

    if (isempty(this.args)) {
      const headOid = await this.repo.refs.updateHead(this.#commitOid);
      await this.repo.refs.updateRef(ORIG_HEAD, headOid);
    }
  }

  defineSpec() {
    const spec = {
      "--soft": arg.flag(() => {
        this.options["mode"] = "soft";
      }),
      "--mixed": arg.flag(() => {
        this.options["mode"] = "mixed";
      }),
      "--hard": arg.flag(() => {
        this.options["mode"] = "hard";
      }),
    };
    return spec;
  }

  initOptions() {
    this.options = {
      mode: "mixed",
    };
  }

  private async resetFiles() {
    if (this.options["mode"] === "soft") {
      return;
    }
    if (this.options["mode"] === "hard") {
      await this.repo.hardReset(this.#commitOid);
      return;
    }

    if (isempty(this.args)) {
      this.repo.index.clearForReset();
      await this.resetPath();
    } else {
      for (const pathname of this.args) {
        await this.resetPath(pathname);
      }
    }
  }
  private async resetPath(pathname?: Pathname) {
    const listing = await this.repo.database.loadTreeList(
      this.#commitOid,
      pathname ? posixPath(pathname) : undefined,
    );
    if (pathname) {
      await this.repo.index.remove(posixPath(pathname));
    }

    for (const [p, entry] of Object.entries(listing)) {
      this.repo.index.addFromDb(posixPath(p), entry);
    }
  }

  private async selectCommitId() {
    const revision = this.args[0] ?? HEAD;
    try {
      this.#commitOid = await new Revision(this.repo, revision).resolve();
    } catch (e) {
      if (e instanceof InvalidObject) {
        const headOid = await this.repo.refs.readHead();
        asserts(headOid !== null, "HEADが存在する必要があります");
        this.#commitOid = headOid;
        return;
      }
      throw e;
    }

    this.args.shift();
  }
}
