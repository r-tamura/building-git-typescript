/**
 * アプリケーション内のエラーで利用されるベースエラー
 */
export class BaseError extends Error {
  name: string;

  constructor(message?: string | undefined) {
    super(message);
    this.name = new.target.name;
    const actualProto = new.target.prototype;
    Object.setPrototypeOf(this, actualProto);
  }
}

export class Invalid extends BaseError {}
