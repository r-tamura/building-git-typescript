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
  /[^ -~]+/, // ASCII制御文字
];

const PARENT = /^(.+)\^$/;
const ANCESTOR = /^(.+)~(\d+)$/;

const REF_ALIASES: { [s: string]: string } = {
  "@": "HEAD",
};

export class InvalidObject extends BaseError {}

export class Revision {
  #repo: Repository;
  #expr: string;
  #query: Rev | null;
  constructor(repo: Repository, expression: string) {
    this.#repo = repo;
    this.#expr = expression;
    this.#query = Revision.parse(expression);
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

  async commitParent(commitOid: OID | null) {
    if (commitOid === null) {
      return null;
    }

    const commit = await this.#repo.database.load(commitOid);
    asserts(
      commit instanceof Commit,
      `commitのオブジェクトID以外はサポートしていません ${commit.oid}`
    );
    return commit.parent;
  }

  async resolve() {
    const oid = await this.#query?.resolve(this);
    if (!oid) {
      throw new InvalidObject(`Not a valid object name: '${this.#expr}'.`);
    }
    return oid;
  }

  async readRef(name: string) {
    return this.#repo.refs.readRef(name);
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
