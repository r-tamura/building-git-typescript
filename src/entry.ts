import { Stats } from "fs";
import * as path from "path";
import * as Database from "./database";
import * as Index from "./gindex";
import { OID, Pathname } from "./types";
import { isExecutable } from "./util/fs";

type ValueOf<T> = T[keyof T];

export const MODE = {
  readable: 0o0100644,
  executable: 0o0100755,
  directory: 0o0040000,
} as const;

export type ModeNumber = ValueOf<typeof MODE>;
export type ModeStr = "100644" | "100755";

// export interface IEntry {
//   readonly parentDirectories: string[];
//   readonly basename: Pathname;
//   mode: ModeNumber | ModeStr;
//   name: Pathname;
//   oid: OID;
//   statMatch(stat: Stats): boolean;
//   timesMatch(stat: Stats): boolean;
//   updateStat(stat: Stats): void;
// }

export type IEntry = Entry | Database.Entry | Index.Entry;

export class Entry {
  static readonly REGULAR_MODE = "100644";
  static readonly EXECUTABLE_MODE = "100755";

  readonly type = "entry";
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
    const dirPath = path.dirname(this.name);
    const directoryComponents = dirPath.split("/");
    return directoryComponents.filter((s) => s !== ".");
  }

  get basename() {
    return path.posix.basename(this.name);
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
