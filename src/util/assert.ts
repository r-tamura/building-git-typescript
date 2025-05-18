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
