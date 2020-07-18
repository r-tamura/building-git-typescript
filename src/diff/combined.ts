import { enumerate, zip } from "../util/array";
import { notNull } from "../util/logic";
import { prop } from "../util/object";
import { Edit, SYMBOLS } from "./myers";

/** 1ファイル分の行差分(Edit)の配列 */
type Diff = Edit[];
type CombinedEdit = Edit | null;

interface Enumerable<T> {
  toArray(): T[];
}

type Diffs = [Diff, Diff];
type Offsets = [number, number];
export class Combined implements Enumerable<Row> {
  #diffs: Diffs;
  #offsets!: Offsets;
  constructor(diffs: Diffs) {
    this.#diffs = diffs;
  }

  *each() {
    this.#offsets = this.#diffs.map((_) => 0) as Offsets;

    while (true) {
      for (const [diff, i] of enumerate(this.#diffs)) {
        yield* this.consumeDeletions(diff, i);
      }

      if (this.complete()) {
        return;
      }

      const edits = this.offsetDiffs().map(([offset, diff]) => diff[offset]);
      this.#offsets = this.#offsets.map((offset) => offset + 1) as Offsets;
      yield Row.of(edits);
    }
  }

  private *consumeDeletions(diff: Diff, i: number) {
    while (this.#offsets[i] < diff.length && diff[this.#offsets[i]].type === "del") {
      const edits = new Array(this.#diffs.length).fill(null) as [CombinedEdit, CombinedEdit];
      edits[i] = diff[this.#offsets[i]];
      this.#offsets[i] += 1;
      yield Row.of(edits);
    }
  }

  private offsetDiffs() {
    return zip(this.#offsets, this.#diffs);
  }

  private complete() {
    return this.offsetDiffs().every(([offset, diff]) => offset >= diff.length);
  }

  toArray() {
    const result = [];
    for (const edit of this.each()) {
      result.push(edit);
    }
    return result;
  }
}

export class Row {
  constructor(public edits: CombinedEdit[]) {}
  static of(edits: CombinedEdit[]) {
    return new Row(edits);
  }
  toString() {
    // 削除・追加・変更なしを示すシンボル: '  ' || '+ ' || ' +' || '++'
    const symbols = this.edits.map((edit) => SYMBOLS[edit?.type ?? "eql"]);

    const del = this.edits.find((edit) => edit?.type === "del");
    const line = del ? del.a_line : this.edits[0]?.b_line;
    return symbols.join("") + line?.text;
  }

  get type() {
    const types = this.edits.filter(notNull).map(prop("type"));
    return types.includes("ins") ? "ins" : types[0];
  }

  get b_line() {
    return this.edits[0]?.b_line ?? null;
  }

  get a_lines() {
    return this.edits.map((edits) => edits?.a_line ?? null);
  }
}
