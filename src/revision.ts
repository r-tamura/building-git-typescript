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

export class Revision {
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

  private static validRef(revision: string) {
    return !INVALID_BRANCH_NAME.some((regex) => regex.test(revision));
  }
}

export type Rev = Ref | Parent | Ancestor;

export class Ref {
  constructor(public name: string) {}
  static of(name: string) {
    const ref = new Ref(name);
    return ref;
  }
}

export class Parent {
  constructor(public rev: Rev) {}
  static of(rev: Rev) {
    const parent = new Parent(rev);
    return parent;
  }
}

export class Ancestor {
  constructor(public rev: Rev, public n: number) {}
  static of(rev: Rev, n: number) {
    const ancestor = new Ancestor(rev, n);
    return ancestor;
  }
}
