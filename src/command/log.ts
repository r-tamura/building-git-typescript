import * as os from "os";
import { Base } from "./base";
import { Commit } from "../database";
import { asserts } from "../util";

export class Log extends Base {
  #blankLine: boolean = false;
  async run() {
    this.setupPager();

    for await (const commit of this.eachCommit()) {
      this.showCommit(commit);
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

  private showCommit(commit: Commit) {
    const author = commit.author;

    this.blankLine();
    this.log(this.fmt("yellow", `commit ${commit.oid}`));
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
