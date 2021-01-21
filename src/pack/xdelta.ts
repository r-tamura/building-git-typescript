import { asserts } from "../util";
import * as array from "../util/array";
import { Copy, Insert } from "./delta";
import { MAX_COPY_SIZE, MAX_INSERT_SIZE } from "./pack";

const BLOCK_SIZE = 16;

type BlockString = string;
type Offset = number;

const ENCODING = "utf8";

/**
 * ソース文字列を16バイトごとに区切った、その部分文字列をキー、そのオフセットのリストを値としたインデックス
 * 同文字列が複数回出現することもあるためオフセットはリスト
 *
 * @example 'the quick brown fox jumps over the slow lazy dog'
 * {
 *  "the quick brown " => [ 0],
 *  "fox jumps over t" => [16],
 *  "he slow lazy dog" => [32]
 * }
 */
type Index = Record<BlockString, Offset[]>;

export type Operation = Insert | Copy;

type OffsetSizePair = [offset: number, size: number];

export class Xdelta {
  // TODO: TreeオブジェクトはバイナリなのでBufferがよいか
  #source: Buffer;
  #target: Buffer = Buffer.alloc(0);
  #index: Index;
  /** compress中のtargetオフセット */
  #offset = 0;
  #ops: Operation[] = [];
  /** Insert buffer */
  #insert: number[] = [];
  static createIndex(source: Buffer): Xdelta {
    const blocks = Math.floor(source.byteLength / BLOCK_SIZE);
    const index: Index = {};

    for (let i = 0; i < blocks; i++) {
      const offset = i * BLOCK_SIZE;
      const slice = source
        .slice(offset, offset + BLOCK_SIZE)
        .toString(ENCODING);

      index[slice] ??= [];
      index[slice].push(offset);
    }

    return new Xdelta(source, index);
  }

  constructor(source: Buffer, index: Index) {
    this.#source = source;
    this.#index = index;
  }

  compress(target: Buffer): Operation[] {
    this.#target = target;
    this.#offset = 0;
    this.#ops = [];
    this.#insert = [];

    while (this.#offset < this.#target.byteLength) {
      this.generateOps();
    }
    this.flushInsert();

    return this.#ops;
  }

  private generateOps(): void {
    let mOffset, mSize;
    [mOffset, mSize] = this.longestMatch();
    if (mSize === 0) {
      this.pushInsert();
      return;
    }

    [mOffset, mSize] = this.expandMatch(mOffset, mSize);

    this.flushInsert();
    this.#ops.push(new Copy(mOffset, mSize));
  }

  private flushInsert(size?: number): void {
    if (size && this.#insert.length < size) {
      return;
    }

    if (array.isempty(this.#insert)) {
      return;
    }
    this.#ops.push(new Insert(Buffer.of(...this.#insert)));
    this.#insert = [];
  }

  /**
   * 現在のウィンドウにマッチする最長の部分文字列をsourceから発見し、そのoffsetとsizeを返します。
   * 見つからない場合は、offsetとsizeを0とします。
   * @returns target文字列内のoffsetとそこからのサイズ
   */
  private longestMatch(): OffsetSizePair {
    const slice = this.#target.slice(this.#offset, this.#offset + BLOCK_SIZE);
    asserts(
      this.#offset >= 0,
      `@offset must be greater than or equal to 0, got ${this.#offset}`
    );
    const sliceString = slice.toString(ENCODING);

    if (!this.#index[sliceString]) {
      return [0, 0];
    }

    let sourceOffset = 0;
    let sourceSize = 0;
    for (const sourceStart of this.#index[sliceString]) {
      const remaining = this.remainingBytes(sourceStart);
      if (remaining <= sourceSize) {
        break;
      }
      const sourceEnd = this.matchFrom(sourceStart, remaining);
      if (sourceSize >= sourceEnd - sourceStart) {
        continue;
      }

      sourceOffset = sourceStart;
      sourceSize = sourceEnd - sourceStart;
    }
    return [sourceOffset, sourceSize];
  }

  private expandMatch(mOffset: number, mSize: number): OffsetSizePair {
    while (
      mOffset > 0 &&
      this.#source[mOffset - 1] === array.last(this.#insert)
    ) {
      if (mSize === MAX_COPY_SIZE) {
        break;
      }

      this.#offset -= 1;
      mOffset -= 1;
      mSize += 1;

      this.#insert.pop();
    }

    this.#offset += mSize;
    return [mOffset, mSize];
  }

  private pushInsert(): void {
    this.#insert.push(this.#target[this.#offset]);
    this.#offset += 1;
    this.flushInsert(MAX_INSERT_SIZE);
  }

  private remainingBytes(pos: number): number {
    const sourceRemaining = this.#source.byteLength - pos;
    const targetRemaining = this.#target.byteLength - this.#offset;

    return Math.min(sourceRemaining, targetRemaining, MAX_COPY_SIZE);
  }

  private matchFrom(sourceStart: number, remaining: number): number {
    let s = sourceStart;
    let t = this.#offset;
    while (remaining > 0 && this.#source[s] === this.#target[t]) {
      [s, t] = [s + 1, t + 1];
      remaining -= 1;
    }

    return s;
  }
}
