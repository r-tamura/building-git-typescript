import * as os from "os";
import { Author } from "./author";
import { OID } from "../types";
import { scanUntil, splitByLine } from "../util";

export class Commit {
  readonly type = "commit";
  oid: OID | null = null;
  tree: OID;
  parent: OID | null = null;
  message: string;

  constructor(
    parent: OID | null,
    tree: OID,
    public author: Author,
    message: string
  ) {
    this.parent = parent;
    this.tree = tree;
    this.message = message;
  }

  static parse(buf: Buffer) {
    const headers: { [s: string]: string } = {};

    let offset = 0;
    while (true) {
      const [linebytes, position] = scanUntil("\n", buf, offset);
      const line = linebytes.toString();
      if (line === "") {
        break;
      }
      const match = /^(?<key>[^ ]+) (?<value>.+)$/.exec(line);
      if (match === null) {
        throw TypeError(`'${line}' doesn't match commit header format.`);
      }
      const key = match.groups?.key;
      const value = match.groups?.value;
      if (!key || !value) {
        throw TypeError(`'${line}' doesn't match commit header format.`);
      }

      headers[key] = value;

      offset = position;
    }
    const comment = buf.slice(offset + 1).toString();
    return new Commit(
      headers["parent"],
      headers["tree"],
      Author.parse(headers["author"]),
      comment
    );
  }

  titleLine() {
    return splitByLine(this.message)[0];
  }

  toString() {
    const lines = [];
    lines.push(`tree ${this.tree}`);
    if (this.parent) {
      lines.push(`parent ${this.parent}`);
    }
    lines.push(`author ${this.author}`);
    lines.push(`committer ${this.author}`);
    lines.push("");
    lines.push(this.message);

    return lines.join(os.EOL);
  }
}
