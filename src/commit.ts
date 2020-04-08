import { GitObject, OID } from "./types";
import { Author } from "./author";
import * as os from "os"

export class Commit implements GitObject {
  oid: string;
  #tree: OID;
  #author: Author;
  #message: string

  constructor(tree: OID, author: Author, message: string) {
    this.#tree = tree
    this.#author = author
    this.#message = message
  }

  type() {
    return "commit"
  };
  toString() {
    const lines = [
      `tree ${this.#tree}`,
      `author ${this.#author}`,
      `committer ${this.#author}`,
      "",
      this.#message
    ]
    return lines.join(os.EOL)
  };
}