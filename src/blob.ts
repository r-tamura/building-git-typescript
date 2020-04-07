import { GitObject, OID } from "./types"

export type Data = string

export class Blob implements GitObject {
  oid: OID
  #data: Data
  constructor(data: Data) {
    this.#data = data
  }

  type() {
    return "blob"
  }

  toString() {
    return this.#data
  }
}