/**
 * アプリケーション内のエラーで利用されるベースエラー
 */
export class BaseError extends Error {
  name: string;

  constructor(e?: string) {
    super(e);
    this.name = new.target.name;
  }
}
