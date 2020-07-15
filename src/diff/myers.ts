import { range, get, set, clone, enumerate, asserts } from "../util";
import { Line } from "./diff";

export class Myers {
  constructor(public a: Line[], public b: Line[]) {}

  static diff(a: Line[], b: Line[]) {
    return new this(a, b).diff();
  }

  *backTrack() {
    let [x, y] = [this.a.length, this.b.length];

    const descending = ([x1, i1]: [number[], number], [x2, i2]: [number[], number]) => i2 - i1;

    const enumerated = enumerate(this.shortestEdit());
    const reversed = enumerated.sort(descending);
    for (const [v, d] of reversed) {
      const k = x - y;
      // 下に動いた = k + 1 された / 右に動いた = k - 1 された
      const prev_k = shouldMoveDown(v, d, k) ? k + 1 : k - 1;
      const prev_x = get(v, prev_k);
      const prev_y = prev_x - prev_k;

      while (canMoveDiagnally(x, prev_x, y, prev_y)) {
        yield [x - 1, y - 1, x, y];
        [x, y] = [x - 1, y - 1];
      }

      if (d > 0) {
        yield [prev_x, prev_y, x, y];
      }
      [x, y] = [prev_x, prev_y];
    }
  }

  diff() {
    const diff: Edit[] = [];
    for (const [prev_x, prev_y, x, y] of this.backTrack()) {
      const [a_line, b_line] = [this.a[prev_x], this.b[prev_y]];
      if (x === prev_x) {
        // x変化なし => yが変化した => 下へ移動した => bのテキストを挿入
        diff.push(Edit.of("ins", null, b_line));
      } else if (y === prev_y) {
        // y変化なし => xが変化した => 右へ移動した => aのテキストを削除
        diff.push(Edit.of("del", a_line, null));
      } else {
        // 対角に移動した => a/bの行が同じ
        diff.push(Edit.of("eql", a_line, b_line));
      }
    }

    return diff.reverse();
  }

  shortestEdit() {
    const trace = [];
    const n = this.a.length;
    const m = this.b.length;
    const max = n + m; // 'd' the most number of moves

    const v: number[] = new Array(2 * max + 1).fill(-1); // '-d' ~ 'd'
    v[1] = 0; // d = 0, x = 0

    for (const d of range(0, max + 1)) {
      trace.push(clone(v));
      for (const k of range(-d, d + 1, 2)) {
        // chose move downward or rightword
        let x = shouldMoveDown(v, d, k) ? get(v, k + 1) : get(v, k - 1) + 1;
        let y = x - k;

        // move diagonal
        while (x < n && y < m && this.a[x].text === this.b[y].text) {
          [x, y] = [x + 1, y + 1];
        }
        set(v, k, x);

        if (x >= n && y >= m) {
          return trace;
        }
      }
    }
    throw Error("something dosen't seem right...");
  }
}

export const SYMBOLS = {
  eql: " ",
  ins: "+",
  del: "-",
};
type SymbolKey = keyof typeof SYMBOLS;

export class Edit {
  constructor(public type: SymbolKey, public a_line: Line | null, public b_line: Line | null) {
    this.throwOnInvalid();
  }

  static of(type: SymbolKey, a_line: Line | null, b_line: Line | null) {
    return new this(type, a_line, b_line);
  }

  toString() {
    const line = this.a_line ?? this.b_line;
    asserts(line !== null);
    return SYMBOLS[this.type] + line.text;
  }

  private throwOnInvalid() {
    if (this.a_line === null && this.b_line === null) {
      throw TypeError("Either a_line or b_line should be valid line");
    }
  }
}

const shouldMoveDown = (v: number[], d: number, k: number) =>
  k === -d || (k !== d && get(v, k - 1) < get(v, k + 1));

const canMoveDiagnally = (x: number, prev_x: number, y: number, prev_y: number) =>
  x > prev_x && y > prev_y;
