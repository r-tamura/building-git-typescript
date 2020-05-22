import * as os from "os";
import { Base } from "./base";
import { Commit } from "../database";
import { asserts } from "../util";
import arg = require("arg");
import { NonNullCommit } from "~/types";

interface Options {
  abbrev: "auto" | boolean;
}

export class Log extends Base<Options> {
  #blankLine: boolean = false;

  async run() {
    this.setupPager();

    for await (const commit of this.eachCommit()) {
      this.showCommit(commit);
    }
  }

  protected defineSpec() {
    return {
      "--abbrev-commit": arg.flag(() => {
        this.options.abbrev = true;
      }),
      "--no-abbrev-commit": arg.flag(() => {
        this.options.abbrev = false;
      }),
    };
  }

  initOptions() {
    this.options = {
      abbrev: "auto",
    };
  }

  private abbrev(commit: NonNullCommit) {
    if (this.options.abbrev === true) {
      return this.repo.database.shortOid(commit.oid);
    } else {
      return commit.oid;
    }
  }

  private async *eachCommit() {
    let oid = await this.repo.refs.readHead();

    while (oid) {
      const commit = await this.repo.database.load(oid);
      asserts(commit.type === "commit");
      yield commit;
      oid = commit.parent;
    }
  }

  private showCommit(commit: NonNullCommit) {
    const author = commit.author;

    this.blankLine();
    this.log(this.fmt("yellow", `commit ${this.abbrev(commit)}`));
    this.log(`Author: ${author.name} <${author.email}>`);
    this.log(`Date:   ${author.readableTime}`);
    this.blankLine();
    for (const line of commit.message.split(os.EOL)) {
      this.log(`    ${line}`);
    }
  }

  private blankLine() {
    if (this.#blankLine) {
      this.log("");
    }
    this.#blankLine = true;
  }
}
