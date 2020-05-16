import { OID } from "./types";
import { Repository } from "./repository";
import { asserts, times, BaseError } from "./util";
import { Commit } from "./database";

const INVALID_BRANCH_NAME = [
  /^\./, // Unixの隠しファイルパスの形式
  /\/\./, // Unixの隠しファイルパスの形式
  /\.\./, // Gitの..オペレータ or Unixの親ディレクトリの形式
  /\/$/, // Unixのディレクトリ名の形式
  /\.lock$/, // .lockファイルの形式
  /@\{/, // Gitの形式の一つ
  /[\x00-\x20*~?:\[\\^~\x7f]+/, // ASCII制御文字
];

const PARENT = /^(.+)\^$/;
const ANCESTOR = /^(.+)~(\d+)$/;

const REF_ALIASES: { [s: string]: string } = {
  "@": "HEAD",
};

const COMMIT = "commit";

export class InvalidObject extends BaseError {}
export class HintedError extends BaseError {
  constructor(public message: string, public hint: string[]) {
    super(message);
  }
}

export class Revision {
  #repo: Repository;
  #expr: string;
  #query: Rev | null;
  errors: HintedError[];
  constructor(repo: Repository, expression: string) {
    this.#repo = repo;
    this.#expr = expression;
    this.#query = Revision.parse(expression);
    this.errors = [];
  }

  static parse(revision: string): Rev | null {
    let match: RegExpMatchArray | null;
    if ((match = PARENT.exec(revision))) {
      const rev = Revision.parse(match[1]) as Ref;
      return rev ? Parent.of(rev) : null;
    } else if ((match = ANCESTOR.exec(revision))) {
      const rev = Revision.parse(match[1]) as Ref;
      return rev ? Ancestor.of(rev, Number.parseInt(match[2])) : null;
    } else if (Revision.validRef(revision)) {
      const name = REF_ALIASES[revision] ?? revision;
      return Ref.of(name);
    }

    return null;
  }

  async commitParent(oid: OID | null) {
    if (oid === null) {
      return null;
    }

    const commit = await this.loadTypedObject(oid, COMMIT);
    if (commit === null || commit.type !== "commit") {
      return null;
    }
    return commit.parent;
  }

  async resolve(type: "commit" | null = null) {
    let oid = (await this.#query?.resolve(this)) ?? null;
    if (type && !(await this.loadTypedObject(oid, type))) {
      oid = null;
    }

    if (!oid) {
      throw new InvalidObject(`Not a valid object name: '${this.#expr}'.`);
    }

    return oid;
  }

  async readRef(name: string) {
    const oid = await this.#repo.refs.readRef(name);

    // オブジェクトIDが見つかった場合
    if (oid) {
      return oid;
    }

    const candidates = await this.#repo.database.prefixMatch(name);
    if (candidates.length === 1) {
      return candidates[0];
    }

    if (candidates.length > 1) {
      await this.logAnbiguousSha1(name, candidates);
    }

    return null;
  }

  private async loadTypedObject(oid: OID | null, type: typeof COMMIT) {
    if (oid === null) {
      return null;
    }

    const object = await this.#repo.database.load(oid);

    if (object.type === type) {
      return object;
    }
    const message = `object ${oid} is a ${object.type}, not a ${type}`;
    this.errors.push(new HintedError(message, []));
    return null;
  }

  private async logAnbiguousSha1(name: string, condidates: OID[]) {
    const objects: string[] = [];
    const sorted = condidates.sort();
    const loadPromises = sorted.map(this.#repo.database.load);
    for await (const object of loadPromises) {
      asserts(object.oid !== null);
      const short = this.#repo.database.shortOid(object.oid);
      const info = `  ${short} ${object.type}`;

      if (object.type === "commit") {
        objects.push(
          `${info} ${object.author.shortDate()} - ${object.titleLine()}`
        );
      } else {
        objects.push(info);
      }
    }

    const message = `short SHA1 ${name} is ambiguous`;
    const hint = ["The candidates are:"].concat(objects);
    this.errors.push(new HintedError(message, hint));
  }

  private static validRef(revision: string) {
    return !INVALID_BRANCH_NAME.some((regex) => regex.test(revision));
  }
}

export type Rev = Ref | Parent | Ancestor;

type ResolveedRevision = string | null;
export class Ref {
  constructor(public name: string) {}
  static of(name: string) {
    const ref = new Ref(name);
    return ref;
  }

  async resolve(context: Revision): Promise<ResolveedRevision> {
    return context.readRef(this.name);
  }
}

export class Parent {
  constructor(public rev: Rev) {}
  static of(rev: Rev) {
    const parent = new Parent(rev);
    return parent;
  }

  async resolve(context: Revision): Promise<ResolveedRevision> {
    const commitOid = await this.rev.resolve(context);
    return context.commitParent(commitOid);
  }
}

export class Ancestor {
  constructor(public rev: Rev, public n: number) {}
  static of(rev: Rev, n: number) {
    const ancestor = new Ancestor(rev, n);
    return ancestor;
  }

  async resolve(context: Revision): Promise<ResolveedRevision> {
    let oid = await this.rev.resolve(context);
    for (const _ of times(this.n)) {
      oid = await context.commitParent(oid);
    }
    return oid;
  }
}