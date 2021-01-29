import * as database from "../database";
import * as progress from "../progress";
import { asserts } from "../util";
import { Delta } from "./delta";
import { Entry } from "./entry";
import { Unpacked, Window } from "./windows";

/** 圧縮するオブジェクトサイズの範囲 50バイト ~ 512MB */
const OBJECT_SIZE_RANGE = { minimum: 50, maximum: 0x20000000 } as const;

const WINDOW_SIZE = 8;

/** 'デルタチェーン'の最大オブジェクト数 */
const MAX_DEPTH = 50;

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
    function compare(
      v1: number | string | undefined,
      v2: number | string | undefined,
    ): number {
      if (typeof v1 === "number") {
        asserts(typeof v2 === "number");
        return v1 - v2;
      }
      asserts(typeof v2 !== "number");
      return compareStrings(v1, v2);
    }

    function compareStrings(
      s1: string | undefined,
      s2: string | undefined,
    ): number {
      if (s1 === undefined && typeof s2 === "string") {
        return -1;
      }
      if (typeof s1 === "string" && s2 === undefined) {
        return 1;
      }

      if (typeof s1 === "string" && typeof s2 === "string") {
        return s1.localeCompare(s2);
      }
      // both are undefined
      return 0;
    }

    this.#progress?.start("Compressing object", this.#objects.length);

    this.#objects.sort((entryA, entryB) => {
      const aKeys = entryA.sortKeys;
      const bKeys = entryB.sortKeys;

      let compared = 0;
      for (let i = 0; i < aKeys.length; i++) {
        const result = compare(aKeys[i], bKeys[i]);
        if (result !== 0) {
          compared = result;
        }
      }
      return compared;
    });

    for (const entry of this.#objects) {
      await this.buildDelta(entry);
      this.#progress.tick();
    }

    this.#progress.stop();
  }

  async buildDelta(entry: Entry): Promise<void> {
    const object = await this.#database.loadRaw(entry.oid);
    const target = this.#widnow.add(entry, object.data);

    for (const source of this.#widnow) {
      this.tryDelta(source, target);
    }
  }

  private tryDelta(source: Unpacked, target: Unpacked): void {
    if (source.type !== target.type) {
      return;
    }

    if (source.depth >= MAX_DEPTH) {
      return;
    }

    const delta = new Delta(source, target);
    const size = target.entry.packedType;

    if (delta.length > size) {
      return;
    }

    if (delta.length === size && delta.base.depth + 1 >= target.depth) {
      return;
    }

    target.entry.assignDelta(delta);
  }
}
