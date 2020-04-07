/**
 * .git/objectsへ保存することができるデータ
 */
export type OID = string;
export interface GitObject {
  oid: OID;
  type: () => string;
  toString: () => string;
}
