export type AuthorName = string;
export type AuthorEmail = string;
export class Author {
  name: AuthorName;
  email: AuthorEmail;
  time: Date;
  constructor(name: AuthorName, email: AuthorEmail, time: Date) {
    this.name = name;
    this.email = email;
    this.time = time;
  }

  static parse(str: string) {
    const match = /(.+) <(.+)> (.+) (.+)/.exec(str);
    if (match === null) {
      throw TypeError(`'${str}' doesn't match author format`);
    }
    const [_, name, email, timestamp, timezone] = match;
    const author = new Author(
      name,
      email,
      // commitオブジェクトは秒までだが、Dateはmsまで必要
      new Date(Number.parseInt(timestamp) * 1000)
    );
    return author;
  }

  shortDate() {
    const year = this.time.getFullYear().toString();
    const month = (this.time.getMonth() + 1).toString().padStart(2, "0");
    const day = this.time.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  toString() {
    // ミリ秒なしのタイムスタンプ
    const timestamp = this.time.getTime() / 1000;
    // タイムゾーン例 +0900,-0800など
    const timezone = this.getTimezoneString();
    return `${this.name} <${this.email}> ${timestamp} ${timezone}`;
  }

  private getTimezoneString() {
    const timezone = this.time.getTimezoneOffset();
    const sign = timezone > 0 ? "-" : "+";
    const tzInHours = Math.abs(timezone) / 60;
    return `${sign}${tzInHours.toString().padStart(2, "0")}00`;
  }
}
