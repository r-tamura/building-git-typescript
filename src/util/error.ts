/**
 * アプリケーション内のエラーで利用されるベースエラー
 */

export interface ErrorConstructor {
  new (message?: string): BaseError;
}

export class BaseError extends Error {
  name: string;

  constructor(message?: string | undefined) {
    super(message);
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/new.target
    this.name = new.target.name;
    const actualProto = new.target.prototype;
    Object.setPrototypeOf(this, actualProto);
  }
}

// https://ruby-doc.org/core-2.7.0/RuntimeError.html
// rubyでは `raise 'error message'` とした場合、Runtimeエラーがthrowされるのでそれを模倣
// JavaScriptの組み込みエラーにはRuntimeErrorがない
export class Runtime extends BaseError {}

export class Invalid extends BaseError {}
