export const HEADER_SIZE = 12;
export const SIGNATURE = "PACK";
export const VERSION = 2;

/** Pack形式内のオブジェクトタイプ */
export const COMMIT = 1;
export const TREE = 2;
export const BLOB = 3;

export type GitObjectType = typeof COMMIT | typeof TREE | typeof BLOB;
