import * as arg from "arg";
import { Style } from "../color";
import * as Repository from "../repository";
import { ConflictStatus } from "../repository";
import { MergeType } from "../repository/pending_commit";
import { Pathname } from "../types";
import { shallowEqual, stripIndent } from "../util";
import { BaseCommand } from "./base";

const SHORT_STATUS: Record<
  Exclude<Repository.ChangeType, null> | "nochange",
  string
> = {
  deleted: "D",
  added: "A",
  modified: "M",
  nochange: " ",
  untracked: "??",
} as const;

const LABEL_WIDTH = 12;
const LONG_STATUS = {
  added: "new file:",
  deleted: "deleted:",
  modified: "modified:",
} as const;
type LongStatus = keyof typeof LONG_STATUS;
function getLongStatus(status: LongStatus) {
  return LONG_STATUS[status];
}

function getConflictShortStatus(conflict: Repository.ConflictStatus) {
  const conflictEquals = (xs: ConflictStatus) => shallowEqual(conflict, xs);
  // prettier-ignore
  const message =
    conflictEquals([1, 2, 3]) ? "UU" :
    conflictEquals([1, 2]) ? "UD" :
    conflictEquals([1, 3]) ? "DU" :
    conflictEquals([2, 3]) ? "AA" :
    conflictEquals([2]) ? "AU" :
    conflictEquals([3]) ? "UA" :
    null;
  if (message === null) {
    throw new TypeError(
      `サポートされていないコンフリクト状態です。 '${conflict}'`,
    );
  }
  return message;
}

const CONFLICT_LABEL_WIDTH = 17;
function getConflictLongStatus(conflict: Repository.ConflictStatus) {
  const conflictEquals = (xs: ConflictStatus) => shallowEqual(conflict, xs);
  // prettier-ignore
  const message =
    conflictEquals([1, 2, 3]) ? "both modified:" :
    conflictEquals([1, 2]) ? "deleted by them:" :
    conflictEquals([1, 3]) ? "deleted by us:" :
    conflictEquals([2, 3]) ? "both added:" :
    conflictEquals([2]) ? "added by us:" :
    conflictEquals([3]) ? "added by them:" :
    null;
  if (message === null) {
    throw new TypeError(
      `サポートされていないコンフリクト状態です。 '${conflict}'`,
    );
  }
  return message;
}

type LableSet = keyof typeof UI_WIDTHS;
const UI_WIDTHS = {
  normal: LABEL_WIDTH,
  conflict: CONFLICT_LABEL_WIDTH,
} as const;

interface Option {
  format: "long" | "porcelain";
}

export class Status extends BaseCommand<Option> {
  #status!: Repository.Status;

  async run() {
    await this.repo.index.loadForUpdate();
    this.#status = await this.repo.status();
    await this.repo.index.writeUpdates();

    await this.printResults();
  }

  protected initOptions() {
    this.options = {
      format: "long",
    };
  }

  protected defineSpec() {
    return {
      "--porcelain": arg.flag(() => {
        this.options.format = "porcelain";
      }),
    };
  }

  private print(alike: Iterable<Pathname>, formatter: (p: Pathname) => string) {
    return Array.from(alike)
      .sort()
      .forEach((p) => {
        this.log(formatter(p));
      });
  }

  private async printBranchStatus() {
    const current = await this.repo.refs.currentRef();
    if (current.head()) {
      this.log(this.fmt("red", "Not currently on any branch"));
    } else {
      this.log(`On branch ${current.shortName()}`);
    }
  }

  private printChanges(
    message: string,
    changeset:
      | Map<Pathname, Repository.ChangeType>
      | Map<Pathname, Repository.ConflictStatus>
      | Set<Pathname>,
    style: Style,
    labelSet: LableSet = "normal",
  ) {
    if (changeset.size === 0) {
      return;
    }

    const width = UI_WIDTHS[labelSet];

    this.log(`${message}:`);
    this.log("");
    // Note: for .. of の場合, Set型の挙動がMapと異なるので forEachを利用
    changeset.forEach(
      (
        type:
          | Repository.ChangeType
          | Repository.ConflictStatus
          | Pathname
          | null,
        pathname: Pathname,
      ) => {
        // prettier-ignore
        const status = isStatusType(type) ? getLongStatus(type).padEnd(width)
        : isConflict(type) ? getConflictLongStatus(type).padEnd(width)
        : "";

        this.log("\t" + this.fmt(style, status + pathname));
      },
    );
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

  private async printResults() {
    switch (this.options.format) {
      case "long":
        await this.printLongFormat();
        break;
      case "porcelain":
        this.printPorcelainFormat();
        break;
    }
  }

  private async printLongFormat() {
    await this.printBranchStatus();
    await this.printUpstreamStatus();
    await this.printPendingCommitStatus();

    this.printChanges(
      "Changes to be committed",
      this.#status.indexChanges,
      "green",
    );
    this.printChanges(
      "Unmerged paths",
      this.#status.conflicts,
      "red",
      "conflict",
    );
    this.printChanges(
      "Changes not staged for commit",
      this.#status.workspaceChanges,
      "red",
    );
    this.printChanges("Untracked files", this.#status.untrackedFiles, "red");

    this.printCommitStatus();
  }

  private printPorcelainFormat() {
    this.print(this.#status.changed, (p) => {
      const status = this.statusFor(p);
      return `${status} ${p}`;
    });
    this.print(
      this.#status.untrackedFiles,
      (p) => `${SHORT_STATUS.untracked} ${p}`,
    );
  }

  private async printPendingCommitStatus() {
    switch (await this.repo.pendingCommit().mergeType()) {
      case "merge":
        if (this.#status.conflicts.size === 0) {
          this.log("All conflicts fixed but you are still merging.");
          this.hint("use 'jit commit' to conclude merge");
        } else {
          this.log("You have unmerged paths.");
          this.hint("fix conflicts and run 'kit commit'");
          this.hint("use 'kit merge --abort' to abort the merge");
        }
        this.log("");
        break;
      case "cherry_pick":
        await this.printPendingType("cherry_pick");
        break;
      case "revert":
        await this.printPendingType("revert");
        break;
    }
  }

  private async printPendingType(mergeType: MergeType) {
    const oid = await this.repo.pendingCommit().mergeOid(mergeType);
    const short = this.repo.database.shortOid(oid);
    const op = mergeType.replace("_", "-");

    this.log(`You are currently ${op}ing commit ${short}`);

    if (this.#status.conflicts.size === 0) {
      this.hint(`all conflicts fixed: run 'kit ${op} --continue'`);
    } else {
      this.hint(`fix conflicts and run 'kit ${op} --continue'`);
    }
    this.hint(`use 'kit ${op} --abort' to cancel the ${op} operation`);
    this.log("");
  }

  private async printUpstreamStatus() {
    const divergence = await this.repo.divergence(
      await this.repo.refs.currentRef(),
    );
    if (divergence?.upstream === undefined) {
      return;
    }

    const base = this.repo.refs.shortName(divergence.upstream);
    const { ahead, behind } = divergence;
    if (ahead === 0 && behind === 0) {
      this.log(`Your branch is up to date with '${base}'.`);
    } else if (behind === 0) {
      this.log(`Your branch is ahead of '${base}' by ${this.commits(ahead)}.`);
    } else if (ahead === 0) {
      this.log(
        `Your branch is behind '${base}' by ${this.commits(
          behind,
        )}, and can be fast-forwared.`,
      );
    } else {
      this.log(stripIndent`
        Your branch and '${base}' have diverged,
        and have ${ahead} and ${behind} different commits each, respectively.
      `);
    }
  }

  private hint(message: string) {
    this.log(`  (${message})`);
  }

  private statusFor(pathname: Pathname) {
    if (this.#status.conflicts.has(pathname)) {
      // コンフリクトが存在することが保証されている
      return getConflictShortStatus(this.#status.conflicts.get(pathname)!);
    } else {
      const left =
        SHORT_STATUS[this.#status.indexChanges.get(pathname) ?? "nochange"];
      const right =
        SHORT_STATUS[this.#status.workspaceChanges.get(pathname) ?? "nochange"];

      return left + right;
    }
  }

  private commits(n: number): string {
    return n === 1 ? "1 commit" : `${n} commits`;
  }
}

function isStatusType(status: any): status is keyof typeof LONG_STATUS {
  return Object.keys(LONG_STATUS).includes(status);
}

function isConflict(value: any): value is Repository.ConflictStatus {
  return Array.isArray(value);
}
