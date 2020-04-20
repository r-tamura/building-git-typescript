import * as path from "path";
import { OID, Pathname } from "./types";
import { Stats } from "fs";
import { isExecutable } from "./util/fs";

export interface IEntry {
  readonly parentDirectories: string[];
  readonly basename: Pathname;
  mode: 0o0100644 | 0o0100755 | 0o40000 | "100644" | "100755";
  name: Pathname;
  oid: OID;
  statMatch(stat: Stats): boolean;
  timesMatch(stat: Stats): boolean;
  updateStat(stat: Stats): void;
}

export class Entry implements IEntry {
  static readonly REGULAR_MODE = "100644";
  static readonly EXECUTABLE_MODE = "100755";
  static readonly DIRECTORY_MODE = 0o040000;

  oid: OID;
  name: Pathname;
  #stat: Stats;
  constructor(pathname: Pathname, oid: OID, stat: Stats) {
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

  statMatch(stat: Stats) {
    // TBI
    return false;
  }

  timesMatch(stat: Stats) {
    // TBI
    return false;
  }

  updateStat(stat: Stats) {
    // TBI
    return;
  }

  private isExecutable() {
    return isExecutable(this.#stat);
  }
}
