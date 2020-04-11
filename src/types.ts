/**
 * .git/objectsへ保存することができるデータ
 */
export type OID = string;
export interface GitObject {
  oid: OID | null;
  type: () => string;
  toString: () => string;
}

/**
 * ファイルパス
 */
export type Pathname = string;
