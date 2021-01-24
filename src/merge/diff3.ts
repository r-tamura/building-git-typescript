import { diff, TextDocument, Line } from "../diff";
import { shallowEqual } from "../util/array";
import { splitByLine } from "../util/text";

/**
 * baseドキュメントと比較して何行目とある比較対象のドキュメントの何行目が一致しているかをマップしたもの
 * キーがbaseドキュメントの行数、値が比較対象のドキュメント
 */
type Matches = Map<LineNumber, LineNumber>;

/** ドキュメント中の行番号 */
type LineNumber = number;

/** ドキュメント内の１行 */
type LineString = string;

/** base/a/bの各ドキュメントでの一致行 */
type MatchingLineNumbers = [orig: LineNumber, a: LineNumber, b: LineNumber];

/** ドキュメント内のmatchin/mismatchingパート */
type Chunk = Clean | Conflict;

export class Diff3 {
  #chunks: Chunk[] = [];
  #line_o = 0;
  #line_a = 0;
  #line_b = 0;
  #o: LineString[];
  #a: LineString[];
  #b: LineString[];
  #match_a: Matches = new Map();
  #match_b: Matches = new Map();

  private constructor(o: LineString[], a: LineString[], b: LineString[]) {
    this.#o = o;
    this.#a = a;
    this.#b = b;
  }

  static merge(o: TextDocument, a: TextDocument, b: TextDocument) {
    const o_lines = typeof o === "string" ? splitByLine(o) : o;
    const a_lines = typeof a === "string" ? splitByLine(a) : a;
    const b_lines = typeof b === "string" ? splitByLine(b) : b;
    return new Diff3(o_lines, a_lines, b_lines).merge();
  }

  private merge() {
    this.setup();
    this.generateChunks();
    return new Result(this.#chunks);
  }

  private setup() {
    this.#chunks = [];
    this.#line_a = this.#line_b = this.#line_o = 0;

    this.#match_a = this.matchSet(this.#a);
    this.#match_b = this.matchSet(this.#b);
  }

  /**
   * 一致パートと差分パートに分割します
   */
  private generateChunks() {
    let c = 0;
    while (true && c < 20) {
      // 次にbase/a/bが一致しない行番号(o上の)を返す。見つからずにドキュメントが最終行を過ぎた場合はnullが返る。
      const i = this.findNextMismatch();

      if (i === 1) {
        // mismatchingパートをインデックスが指している
        const [o, a, b] = this.findNextMatch();
        if (a && b) {
          // matchingパート
          this.emitChunk(o, a, b);
        } else {
          this.emitFinalChunk();
          return;
        }
      } else if (i) {
        // mismatchingパート(mistmatchingの種類でClean/Conflictが変わる)
        this.emitChunk(this.#line_o + i, this.#line_a + i, this.#line_b + i);
      } else {
        this.emitFinalChunk();
        return;
      }
      c++;
    }
    if (c === 10) {
      throw new Error("c === 10");
    }
  }

  /**
   * baseのどの行と対象のドキュメントのどの行が一致するかのマップを取得します
   * @param file baseと比較するドキュメントの全行
   */
  private matchSet(file: LineString[]) {
    const matches: Matches = new Map();
    diff(this.#o, file).forEach((edit) => {
      if (edit.type !== "eql") {
        return;
      }
      // eqlの場合はa_line/b_lineがNull出ないことが保証される
      const a_line = edit.a_line as Line;
      const b_line = edit.b_line as Line;
      matches.set(a_line.number, b_line.number);
    });

    return matches;
  }

  private findNextMismatch() {
    let i = 1;
    // ドキュメントの行数内 かつ base/a/bと一致している限りindexを加算する
    while (
      this.inBound(i) &&
      this.match(this.#match_a, this.#line_a, i) &&
      this.match(this.#match_b, this.#line_b, i)
    ) {
      i += 1;
    }
    return this.inBound(i) ? i : null;
  }

  private findNextMatch(): MatchingLineNumbers {
    let o = this.#line_o + 1;
    // ドキュメントの行数内 かつ base/a/bの全てが一致しない限りindexを加算する
    while (
      o <= this.#o.length &&
      (!this.#match_a.get(o) || !this.#match_b.get(o))
    ) {
      o += 1;
    }
    // whileの条件より、whileを抜けた時点でoに対する値が存在することが確定する
    const a = this.#match_a.get(o) as LineNumber;
    const b = this.#match_b.get(o) as LineNumber;
    return [o, a, b];
  }

  private emitChunk(o: LineNumber, a: LineNumber, b: LineNumber) {
    this.writeChunk(
      this.#o.slice(this.#line_o, o - 1),
      this.#a.slice(this.#line_a, a - 1),
      this.#b.slice(this.#line_b, b - 1),
    );
    this.#line_o = o - 1;
    this.#line_a = a - 1;
    this.#line_b = b - 1;
  }

  private emitFinalChunk() {
    this.writeChunk(
      this.#o.slice(this.#line_o),
      this.#a.slice(this.#line_a),
      this.#b.slice(this.#line_b),
    );
  }

  private inBound(i: number) {
    return (
      this.#line_o + i <= this.#o.length ||
      this.#line_a + i <= this.#a.length ||
      this.#line_b + i <= this.#b.length
    );
  }

  private match(matches: Matches, offset: number, i: number) {
    return matches.get(this.#line_o + i) === offset + i;
  }

  private writeChunk(o: LineString[], a: LineString[], b: LineString[]) {
    if (shallowEqual(a, o) || shallowEqual(a, b)) {
      // ドキュメントaのみ変更された場合 or ドキュメントa/bで同じ変更がされた場合
      this.#chunks.push(Clean.of(b));
    } else if (shallowEqual(b, o)) {
      // ドキュメントaのみ変更された場合
      this.#chunks.push(Clean.of(a));
    } else {
      // ドキュメントa/bで異なる変更がされた場合
      this.#chunks.push(Conflict.of(o, a, b));
    }
  }
}

/** diff3でa/bがコンフリクトとならないチャンク */
class Clean {
  private constructor(public lines: LineString[]) {}
  static of(lines: LineString[]) {
    const self = new Clean(lines);
    return self;
  }

  isClean() {
    return true;
  }

  isConflict() {
    return false;
  }

  toString(..._: unknown[]) {
    return this.lines.join("");
  }
}

/** diff3でa/bがコンフリクトとなるチャンク */
class Conflict {
  private constructor(
    public o_lines: LineString[],
    public a_lines: LineString[],
    public b_lines: LineString[],
  ) {}

  static of(
    o_lines: LineString[],
    a_lines: LineString[],
    b_lines: LineString[],
  ) {
    const self = new Conflict(o_lines, a_lines, b_lines);
    return self;
  }

  isClean() {
    return false;
  }

  isConflict() {
    return true;
  }

  toString(a_name: string | null = null, b_name: string | null = null) {
    let text = "";
    text = this.separator(text, "<", a_name);
    this.a_lines.forEach((line) => {
      text = text + line;
    });
    text = this.separator(text, "=");
    this.b_lines.forEach((line) => {
      text = text + line;
    });
    text = this.separator(text, ">", b_name);
    return text;
  }

  private separator(text: string, sepChar: string, name: string | null = null) {
    text = text + sepChar.repeat(7);
    if (name) {
      text = text + ` ${name}`;
    }
    text = text + "\n";
    return text;
  }
}

class Result {
  constructor(public chunks: Chunk[]) {}
  static of(chunks: Chunk[]) {
    const self = new Result(chunks);
    return self;
  }

  clean() {
    return this.chunks.every((chunk) => chunk.isClean());
  }

  toString(a_name: string | null = null, b_name: string | null = null) {
    return this.chunks.map((chunk) => chunk.toString(a_name, b_name)).join("");
  }
}
