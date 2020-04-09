import { AssertionError } from "assert";

/**
 * アサーション関数 - 条件がtrueの場合、その関数実行後に保証する
 * https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions
 * @param cond 条件
 * @param msg 条件を満たさない場合のエラーに含まれるメッセージ
 */
export function assert(cond: boolean, msg?: string): asserts cond {
  // この関数はfunctionで宣言する必要がある
  // https://qiita.com/arx8/items/a87fe4bb4bf9be89a146
  if (!cond) throw new AssertionError({ message: msg });
}
