import { Entry } from "./entry";
import { GitObject, OID } from "./types";

export class Tree implements GitObject {
  static ENTRY_FORMAT = "A7Z*H40"

  oid: OID | null = null
  #entries: Entry[]
  constructor(entries: Entry[]) {
    this.#entries = entries
  }

  type() {
    return "tree"
  }

  /**
  *  Treeをシリアライズします
  * それぞれのEntryは MODE + ' ' + Entry#name + '\0' + 20バイトにパックされたOID
  */
  toString() {
    this.#entries.sort((e1, e2) => e1.name <= e2.name ? -1 : 1)

    const entries = this.#entries.map(entry => {
      const encodedMode = Buffer.from(entry.mode + " ", "ascii")
      const encodedName = Buffer.from(entry.name + '\0', "ascii")
      const encodedOId = Buffer.from(entry.oid, "hex")

      return Buffer.concat([encodedMode, encodedName, encodedOId])
    })

    const bytes = entries.reduce((buf, acc) => Buffer.concat([buf, acc]))
    return bytes.toString("binary")
  }
}