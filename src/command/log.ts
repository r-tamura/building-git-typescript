import * as os from "os";
import arg = require("arg");
import { Base } from "./base";
import { asserts, includes, shallowEqual, partition } from "../util";
import { CompleteCommit, Pathname } from "../types";
import { SymRef } from "../refs";
import { Style } from "../color";
import {
  definePrintDiffOptions,
  printDiff,
  Target,
  NULL_OID,
} from "./shared/print_diff";
import { Entry, Change } from "../database";
import { RevList } from "../rev_list";

const FORMAT = ["medium", "oneline"] as const;
const DECORATE = ["auto", "short", "full", "no"] as const;
interface Options {
  abbrev: "auto" | boolean;
  format: typeof FORMAT[number];
  decorate: typeof DECORATE[number];
  patch: boolean;
}

export class Log extends Base<Options> {
  #blankLine: boolean = false;
  #reverseRefs!: Map<string, SymRef[]>;
  #currentRef!: SymRef;
  #revList!: RevList;

  async run() {
    this.setupPager();

    this.#reverseRefs = await this.repo.refs.reverseRefs();
    this.#currentRef = await this.repo.refs.currentRef();

    this.#revList = await RevList.fromRevs(this.repo, this.args);
    for await (const commit of this.#revList.each()) {
      await this.showCommit(commit);
    }
  }

  protected defineSpec(): arg.Spec {
    const printDiffOptions = definePrintDiffOptions(this);
    return {
      "--abbrev-commit": arg.flag(() => {
        this.options.abbrev = true;
      }),
      "--no-abbrev-commit": arg.flag(() => {
        this.options.abbrev = false;
      }),
      "--pretty": (format: string) => {
        if (!includes(format, FORMAT)) {
          return;
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
      // TODO: --decorate デフォルト引数対応 (argライブラリはパース非対応)
      "--decorate": (decorate: string) => {
        if (!includes(decorate, DECORATE)) {
          return;
        }
        this.options.decorate = decorate;
      },
      "--no-decorate": arg.flag(() => {
        this.options.decorate = "no";
      }),
      ...printDiffOptions,
    };
  }

  initOptions() {
    this.options = {
      abbrev: "auto",
      format: "medium",
      decorate: "auto",
      patch: false,
    };
  }

  private abbrev(commit: CompleteCommit) {
    if (this.options.abbrev === true) {
      return this.repo.database.shortOid(commit.oid);
    } else {
      return commit.oid;
    }
  }

  private decorate(commit: CompleteCommit) {
    switch (this.options.decorate) {
      case "auto":
        if (!this.stdout.isTTY) {
          return "";
        }
        break;
      case "no":
        return "";
    }

    const refs = this.#reverseRefs.get(commit.oid);
    if (!refs || refs.length === 0) {
      return "";
    }

    const [[head], restRefs] = partition(
      refs,
      (ref) => ref.head() && !this.#currentRef.head()
    );
    const names = restRefs.map((ref) => this.decorationName(head, ref));

    return (
      this.fmt("yellow", " (") +
      names.join(this.fmt("yellow", ", ")) +
      this.fmt("yellow", ")")
    );
  }

  private decorationName(head: SymRef, ref: SymRef) {
    let name: string = "";
    switch (this.options.decorate) {
      case "short":
      case "auto":
        name = ref.shortName();
        break;
      case "full":
        name = ref.path;
        break;
    }
    name = this.fmt(this.refColor(ref), name);

    if (head && shallowEqual(ref, this.#currentRef)) {
      name = this.fmt(this.refColor(head), `${head.path} -> ${name}`);
    }
    return name;
  }

  private refColor(ref: SymRef): Style[] {
    return ref.head() ? ["bold", "cyan"] : ["bold", "green"];
  }

  private async showCommit(commit: CompleteCommit) {
    switch (this.options.format) {
      case "medium":
        this.showCommitMedium(commit);
        break;
      case "oneline":
        this.showCommitOneline(commit);
        break;
    }

    await this.showPatch(commit);
  }

  private showCommitMedium(commit: CompleteCommit) {
    const author = commit.author;

    this.blankLine();
    this.log(
      this.fmt("yellow", `commit ${this.abbrev(commit)}`) +
        this.decorate(commit)
    );
    this.log(`Author: ${author.name} <${author.email}>`);
    this.log(`Date:   ${author.readableTime}`);
    this.blankLine();
    for (const line of commit.message.split(os.EOL)) {
      this.log(`    ${line}`);
    }
  }

  private showCommitOneline(commit: CompleteCommit) {
    const id = this.fmt("yellow", this.abbrev(commit)) + this.decorate(commit);
    this.log(`${id} ${commit.titleLine()}`);
  }

  private async showPatch(commit: CompleteCommit) {
    if (!this.options.patch) {
      return;
    }

    const diff = await this.#revList.treediff(commit.parent, commit.oid);
    const paths = Array.from(diff.keys()).sort();

    this.blankLine();

    for (const pathname of paths) {
      // pathsはdiffのキー要素のみからなる
      const change = diff.get(pathname) as Change;
      const [oldItem, newItem] = change;
      const a = await this.fromDiffItem(pathname, oldItem);
      const b = await this.fromDiffItem(pathname, newItem);
      printDiff(a, b, this);
    }
  }

  private async fromDiffItem(pathname: Pathname, item: Entry | null) {
    if (item) {
      const blob = await this.repo.database.load(item.oid);
      asserts(blob.type === "blob");
      return Target.of(
        pathname,
        item.oid,
        item.mode.toString(8),
        blob.data.toString()
      );
    } else {
      return Target.of(pathname, NULL_OID, null, "");
    }
  }

  private blankLine() {
    if (this.options.format === "oneline") {
      return;
    }
    if (this.#blankLine) {
      this.log("");
    }
    this.#blankLine = true;
  }
}