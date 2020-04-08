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
