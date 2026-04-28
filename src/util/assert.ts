import { AssertionError } from "node:assert";
import { GitObject, NonNullProps } from "../types.ts";

/**
 * アサーション関数 - 条件がtrueの場合、その関数実行後に保証する
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions
 * @param cond 条件
 * @param msg 条件を満たさない場合のエラーに含まれるメッセージ
 */
export function asserts(cond: boolean, msg?: string): asserts cond {
  // この関数はfunctionで宣言する必要がある
  // https://qiita.com/arx8/items/a87fe4bb4bf9be89a146
  if (!cond) throw new AssertionError({ message: msg });
}

/**
 * 「ここには到達しないはず」をプログラマが表明したときに throw されるエラー。
 * ビジネスロジック由来のエラー (BaseError 派生) とは区別して、
 * 「コードの不変条件が壊れている」ことを伝える。
 */
export class Unreachable extends Error {
  static {
    this.prototype.name = "Unreachable";
  }
  constructor(message = "unreachable code path") {
    super(message);
  }
}

/**
 * 到達しないはずのコード経路で呼び出すと Unreachable を投げる。
 * 戻り値が never なので、呼び出し以降は型レベルで「到達しない」と扱われる。
 *
 * @example
 *   for await (const line of conn.recvUntil(null)) {
 *     if (line === null) unreachable("recvUntil(null) は null を yield しない");
 *     // 以降 line は string に narrow される
 *   }
 */
export function unreachable(msg?: string): never {
  throw new Unreachable(msg);
}

/**
 * Git objectがoidを持っていることを保証する
 * @param obj Git object
 * @param msg 条件を満たさない場合のエラーに含まれるメッセージ
 */
export function assertsComplete<T extends GitObject>(
  obj: T,
  msg?: string,
): asserts obj is NonNullProps<T> {
  asserts(obj.oid !== null, msg ?? "OIDを持つGit Objectです");
}
