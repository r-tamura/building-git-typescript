import * as path from "path";
import { OID } from "./types";
import { Stats } from "fs";

export type EntryName = string;

export class Entry {
  static REGULAR_MODE = "100644";
  static EXECUTABLE_MODE = "100755";
  static DIRECTORY_MODE = "40000";

  oid: OID;
  name: EntryName;
  #stat: Stats;
  constructor(pathname: EntryName, oid: OID, stat: Stats) {
    this.name = pathname;

    this.oid = oid;
    this.#stat = stat;
  }

  get mode() {
    return this.isExecutable() ? Entry.EXECUTABLE_MODE : Entry.REGULAR_MODE;
  }

  get parentDirectories() {
    // - path.dirname は ファイル名の見の場合 ['.'] を返すため、'.' を削除する
    // ```
    // > path.dirname("c.txt")
    // '.'
    // ```
    return path
      .dirname(this.name)
      .split(path.sep)
      .filter((s) => s !== ".");
  }

  get basename() {
    return path.basename(this.name);
  }

  private isExecutable() {
    const modeBin = this.#stat.mode.toString(2);
    const user = modeBin.slice(7, 10);
    const isExecutable = 0b001 & Number.parseInt(user, 2);
    return isExecutable === 1;
  }
}
