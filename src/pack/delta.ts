export class Delta {}

/**
 * XDeltaアルゴリズムのCopy操作
 */
export class Copy {
  readonly type = "copy";
  constructor(public offset: number, public size: number) {}
}

/**
 * XDeltaアルゴリズムのInsert操作
 */
export class Insert {
  readonly type = "insert";
  constructor(public data: Buffer) {}
}
