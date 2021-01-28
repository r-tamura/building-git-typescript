import * as database from "../database";
import * as progress from "../progress";
import { Entry } from "./entry";
import { Window } from "./windows";

/** 圧縮するオブジェクトサイズの範囲 50バイト ~ 512MB */
const OBJECT_SIZE_RANGE = { minimum: 50, maximum: 0x20000000 } as const;

const WINDOW_SIZE = 8;

export class Compressor {
  #database: database.Database;
  #progress: progress.Progress;
  #objects: Entry[] = [];
  #widnow: Window;

  constructor(database: database.Database, progress: progress.Progress) {
    this.#database = database;
    this.#progress = progress;
    this.#widnow = new Window(WINDOW_SIZE);
  }

  add(entry: Entry): void {
    if (
      entry.size < OBJECT_SIZE_RANGE.minimum ||
      OBJECT_SIZE_RANGE.maximum < entry.size
    ) {
      return;
    }
    this.#objects.push(entry);
  }

  async buildDeltas() {
    this.#progress?.start("Compressing object", this.#objects.length);

    this.#objects.sort((entryA, entryB) => {
      const aKeys = entryA.sortKeys;
      const bKeys = entryB.sortKeys;

      for (let i = 0; i < aKeys.length; i++) {
        const a = aKeys[i];
        const b = bKeys[i];
        if (a !== b) {
          // type or size
          if (typeof a === "number" && typeof b === "number") {
            return a - b;
          }

          // basenme or dirname
          if (a === undefined) {
            return -1;
          }
          if (typeof a === "string" && b === undefined) {
            return 1;
          }

          if (typeof a === "string" && typeof b === "string") {
            return a.localeCompare(b);
          }

          throw new Error("a and b must be compareable");
        }
      }
      return 0;
    });

    for (const entry of this.#objects) {
      await this.buildDelta(entry);
      this.#progress.tick();
    }

    this.#progress.stop();
  }

  async buildDelta(entry: Entry): Promise<void> {}
}
