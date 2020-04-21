import * as os from "os";
import { Author } from "./author";
import { GitObject, OID } from "../types";
import { scanUntil, asserts } from "../util";

export class Commit implements GitObject {
  oid: OID | null = null;
  tree: OID;
  #parent: OID | null = null;
  #author: Author;
  #message: string;

  constructor(parent: OID | null, tree: OID, author: Author, message: string) {
    this.#parent = parent;
    this.tree = tree;
    this.#author = author;
    this.#message = message;
  }

  static parse(buf: Buffer) {
    const headers: { [s: string]: string } = {};

    let offset = 0;
    let author;
    while (true) {
      const [linebytes, position] = scanUntil("\n", buf, offset);
      const line = linebytes.toString();
      if (line === "") {
        break;
      }
      const [key, ...values] = line.split(" ");

      if (key === "author") {
        author = new Author(
          values[0],
          values[1].replace("<", "").replace(">", ""),
          // commitオブジェクトは秒までだが、Dateはmsまで必要
          new Date(Number.parseInt(values[2]) * 1000)
        );
      } else {
        headers[key] = values.join(" ");
      }

      offset = position;
    }
    const comment = buf.slice(offset + 1).toString();

    asserts(typeof author !== "undefined");

    return new Commit(headers["parent"], headers["tree"], author, comment);
  }

  type() {
    return "commit";
  }

  toString() {
    const lines = [];
    lines.push(`tree ${this.tree}`);
    if (this.#parent) {
      lines.push(`parent ${this.#parent}`);
    }
    lines.push(`author ${this.#author}`);
    lines.push(`committer ${this.#author}`);
    lines.push("");
    lines.push(this.#message);

    return lines.join(os.EOL);
  }
}
