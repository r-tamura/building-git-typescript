import { OID } from "../types";
import { Hash, scanUntil, splitByLine } from "../util";
import { Author } from "./author";

export class Commit {
  readonly type = "commit";
  oid: OID | null = null;

  constructor(
    public parents: OID[],
    public tree: OID,
    public author: Author,
    public commiter: Author,
    public message: string,
  ) {}

  static parse(buf: Buffer) {
    const headers = new Hash<string, string[]>((hash, key) =>
      hash.set(key, []),
    );
    let offset = 0;
    while (true) {
      const [linebytes, position] = scanUntil("\n", buf, offset);
      const line = linebytes.toString();
      if (line === "") {
        break;
      }
      const match = /^(?<key>[^ ]+) (?<value>.+)$/.exec(line);
      if (match === null) {
        throw TypeError(`line: '${line.trim()}' doesn't match commit header format.`);
      }
      const key = match.groups?.key;
      const value = match.groups?.value;
      if (!key || !value) {
        throw TypeError(`line: '${line.trim()}' doesn't match commit header format.`);
      }

      headers.get(key).push(value);

      offset = position;
    }
    const comment = buf.slice(offset + 1).toString();
    return new Commit(
      headers.get("parent"), // parentがない場合はnull
      headers.get("tree")[0],
      Author.parse(headers.get("author")[0]),
      Author.parse(headers.get("committer")[0]),
      comment,
    );
  }

  get date() {
    return this.commiter.time;
  }

  get parent(): OID | null {
    return this.parents[0] ?? null;
  }

  get merge() {
    return this.parents.length > 1;
  }

  titleLine() {
    return splitByLine(this.message)[0];
  }

  toString() {
    const lines = [];
    lines.push(`tree ${this.tree}`);
    lines.push(...this.parents.map((oid) => `parent ${oid}`));
    lines.push(`author ${this.author}`);
    lines.push(`committer ${this.commiter}`);
    lines.push("");
    lines.push(this.message);

    return lines.join("\n");
  }
}
