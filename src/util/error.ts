/**
 * アプリケーション内のエラーで利用されるベースエラー
 */

import { asserts } from "./assert";

export interface ErrorConstructor {
  new (message?: string): BaseError;
}

export class BaseError extends Error {
  static {
    this.prototype.name = "KitBaseError";
  }
}

// https://ruby-doc.org/core-2.7.0/RuntimeError.html
// rubyでは `raise 'error message'` とした場合、Runtimeエラーがthrowされるのでそれを模倣
// JavaScriptの組み込みエラーにはRuntimeErrorがない
export class Runtime extends BaseError {}

export class Invalid extends BaseError {}

export function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  // TODO: 厳格な型判定
  asserts(typeof e === "object" && e != null, "unknown error");
  if ("code" in e) {
    return true;
  }
  return false;
}
