import { Entry } from "./entry";
import { Xdelta } from "./xdelta";
// import { Delta } from './delta'
export class Unpacked {
  deltaIndex?: Xdelta;
  static of(entry: Entry, data: Buffer) {
    return new this(entry, data);
  }

  constructor(public entry: Entry, public data: Buffer) {}

  get type() {
    return this.entry.type;
  }

  get size() {
    return this.entry.size;
  }

  get delta() {
    return this.entry.delta;
  }

  get depth() {
    return this.entry.depth;
  }
}
export class Window {
  /** エントリを保有するウィンドウ */
  #objects: Unpacked[];
  #offset = 0;
  constructor(size: number) {
    this.#objects = new Array(size).fill(undefined);
  }

  add(entry: Entry, data: Buffer): Unpacked {
    const unpacked = Unpacked.of(entry, data);
    this.#objects[this.#offset] = unpacked;
    this.#offset = this.wrap(this.#offset + 1);
    return unpacked;
  }

  wrap(offset: number): number {
    // JavaScriptとRubyで剰余演算の対象が負の場合の挙動が異なる
    const length = this.#objects.length;
    return ((offset % length) + length) % length;
  }

  *each() {
    yield this;
  }

  *[Symbol.iterator](): Generator<Unpacked, void, void> {
    let cursor = this.wrap(this.#offset - 2);
    const limit = this.wrap(this.#offset - 1);

    while (cursor !== limit) {
      const unpacked = this.#objects[cursor];
      if (unpacked) {
        yield unpacked;
      }
      cursor = this.wrap(cursor - 1);
    }
    return;
  }
}
