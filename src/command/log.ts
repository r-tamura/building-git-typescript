import * as os from "os";
import arg = require("arg");
import { Base } from "./base";
import { asserts, includes } from "../util";
import { CompleteCommit } from "../types";

const FORMAT = ["medium", "oneline"] as const;
interface Options {
  abbrev: "auto" | boolean;
  format: typeof FORMAT[number];
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
      "--pretty": (format: string) => {
        if (!includes(format, FORMAT)) {
          throw TypeError(
            `invalid format '${format}', should be one of ${FORMAT.join(
              ", "
            )}. `
          );
        }
        this.options.format = format;
      },
      "--format": "--pretty",
      "--oneline": arg.flag(() => {
        if (this.options.abbrev === "auto") {
          this.options.abbrev = true;
        }
        this.options.format = "oneline";
      }),
    };
  }

  initOptions() {
    this.options = {
      abbrev: "auto",
      format: "medium",
    };
  }

  private abbrev(commit: CompleteCommit) {
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

  private showCommit(commit: CompleteCommit) {
    switch (this.options.format) {
      case "medium":
        return this.showCommitMedium(commit);
      case "oneline":
        return this.showCommitOneline(commit);
    }
  }

  private showCommitMedium(commit: CompleteCommit) {
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

  private showCommitOneline(commit: CompleteCommit) {
    this.log(
      `${this.fmt("yellow", this.abbrev(commit))} ${commit.titleLine()}`
    );
  }

  private blankLine() {
    if (this.#blankLine) {
      this.log("");
    }
    this.#blankLine = true;
  }
}
