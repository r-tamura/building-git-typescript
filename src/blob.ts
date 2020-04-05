export type OID = string
export type Data = string

export class Blob {
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