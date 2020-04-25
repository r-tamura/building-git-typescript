import { Base } from "./base";
import { Pathname } from "../types";
import { Style } from "../color";
import * as Repository from "../repository";

const SHORT_STATUS: Record<Repository.ChangeType, string> = {
  deleted: "D",
  added: "A",
  modified: "M",
  nochange: " ",
} as const;

const LABEL_WIDTH = 12;
const LONG_STATUS = {
  added: "new file:",
  deleted: "deleted:",
  modified: "modified:",
} as const;

export class Status extends Base {
  #status!: Repository.Status;

  async run() {
    await this.repo.index.loadForUpdate();
    this.#status = await this.repo.status;
    await this.repo.index.writeUpdates();

    this.printResults();
  }

  private print(alike: Iterable<Pathname>, formatter: (p: Pathname) => string) {
    return Array.from(alike)
      .sort()
      .forEach((p) => {
        this.log(formatter(p));
      });
  }

  private printChanges(
    message: string,
    changeset: Map<Pathname, Repository.ChangeType> | Set<Pathname>,
    style: Style
  ) {
    if (changeset.size === 0) {
      return;
    }

    this.log(`${message}:`);
    this.log("");
    changeset.forEach((type: string, name: string) => {
      const status = this.isStatusType(type)
        ? LONG_STATUS[type].padEnd(LABEL_WIDTH, " ")
        : "";
      this.log("\t" + this.fmt(style, status + name));
    });
    this.log("");
  }

  private printCommitStatus() {
    if (this.#status.indexChanges.size > 0) {
      return;
    }

    if (this.#status.workspaceChanges.size > 0) {
      this.log("no changes added to commit");
    } else if (this.#status.untrackedFiles.size > 0) {
      this.log("nothing added to commit but untracked files present");
    } else {
      this.log("nothing to commit, working tree clean");
    }
  }

  private printResults() {
    if (this.args[0] === "--porcelain") {
      this.printPorcelainFormat();
    } else {
      this.printLongFormat();
    }
  }

  private printLongFormat() {
    this.printChanges(
      "Changes to be committed",
      this.#status.indexChanges,
      "green"
    );
    this.printChanges(
      "Changes not staged for commit",
      this.#status.workspaceChanges,
      "red"
    );
    this.printChanges("Untracked files", this.#status.untrackedFiles, "red");

    this.printCommitStatus();
  }

  private printPorcelainFormat() {
    this.print(this.#status.changed, (p) => {
      const status = this.statusFor(p);
      return `${status} ${p}`;
    });
    this.print(this.#status.untrackedFiles, (p) => `?? ${p}`);
  }

  private statusFor(pathname: Pathname) {
    const left =
      SHORT_STATUS[this.#status.indexChanges.get(pathname) ?? "nochange"];
    const right =
      SHORT_STATUS[this.#status.workspaceChanges.get(pathname) ?? "nochange"];

    return left + right;
  }

  private isStatusType(status: string): status is keyof typeof LONG_STATUS {
    return Object.keys(LONG_STATUS).includes(status);
  }
}
