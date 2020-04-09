import { GitObject, OID } from "./types";
import { Author } from "./author";
import * as os from "os"

export class Commit implements GitObject {
  oid: OID | null = null;
  #parent: OID | null = null;
  #tree: OID;
  #author: Author;
  #message: string

  constructor(parent: OID | null, tree: OID, author: Author, message: string) {
    this.#parent = parent
    this.#tree = tree
    this.#author = author
    this.#message = message
  }

  type() {
    return "commit"
  }

  toString() {
    const lines = []
    lines.push(`tree ${this.#tree}`)
    if (this.#parent) {
      lines.push(`parent ${this.#parent}`)
    }
    lines.push(`author ${this.#author}`)
    lines.push(`committer ${this.#author}`)
    lines.push("")
    lines.push(this.#message)

    return lines.join(os.EOL)
  }
}