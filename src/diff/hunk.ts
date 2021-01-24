import { Edit } from "./myers";
import { get, transpose } from "../util/array";
import { prop } from "../util/object";
import { Line } from "./diff";
import { notNull } from "../util/logic";

const HUNK_CONTEXT = 3;

// EditとRowの共通項
export type HunkEdit = Pick<Edit, "a_lines" | "b_line" | "type">;

export class Hunk {
  constructor(
    public a_starts: (number | null)[],
    public b_start: number | null,
    public edits: HunkEdit[],
  ) {}

  static of(
    a_starts: (number | null)[],
    b_start: number | null,
    edits: HunkEdit[],
  ) {
    return new this(a_starts, b_start, edits);
  }

  static filter(edits: HunkEdit[]): Hunk[] {
    const hunks: Hunk[] = [];
    let offset = 0;

    while (offset < edits.length) {
      const [progress, done] = progressUntilChange(edits, offset);

      // 1つのhunkには変更行の前後3行を含める
      if (done) {
        break;
      }
      offset += progress - (HUNK_CONTEXT + 1);

      // TODO: .map(prop("number"))とすると、a_linesにnullが含まれるのでコンパイルエラー
      const a_starts =
        offset < 0 ? [] : edits[offset].a_lines.map(getLineNumber);
      const b_start = offset < 0 ? null : edits[offset].b_line?.number ?? null;
      hunks.push(Hunk.of(a_starts, b_start, []));
      offset = Hunk.build(get(hunks, -1), edits, offset);
    }
    return hunks;
  }

  static build(hunk: Hunk, edits: HunkEdit[], start: number) {
    let counter = -1;

    let offset = start;
    while (counter !== 0) {
      if (offset >= 0 && counter > 0) {
        hunk.edits.push(edits[offset]);
      }

      offset += 1;
      if (offset >= edits.length) {
        break;
      }
      switch (edits[offset + HUNK_CONTEXT]?.type) {
        case "del":
        case "ins":
          counter = 2 * HUNK_CONTEXT + 1;
          break;
        default:
          counter -= 1;
      }
    }
    return offset;
  }

  /**
   * Hunkヘッダの生成
   * @@ -75,4 +77,17 @@(通常diff)や'@@@ -1,3 -1,3 +1,4 @@@'(combined diff)など
   */
  header() {
    const a_lines = transpose(this.edits.map(prop("a_lines")));
    const offsets = a_lines.map((lines, i) =>
      this.format("-", lines, this.a_starts[i]),
    );

    offsets.push(
      this.format("+", this.edits.map(prop("b_line")), this.b_start),
    );
    const sep = "@".repeat(offsets.length);

    return [sep, ...offsets, sep].join(" ");
  }

  private format(
    sign: "+" | "-",
    lines: (Line | null)[],
    start: number | null,
  ) {
    const nonNullLines = lines.filter(notNull);
    const start_ = nonNullLines[0]?.number ?? start ?? 0;
    return `${sign}${start_},${nonNullLines.length}`;
  }
}

function progressUntilChange(
  edits: HunkEdit[],
  start: number,
): [progress: number, done: boolean] {
  let offset = start;
  while (edits[offset]?.type == "eql" && offset < edits.length) {
    offset += 1;
  }
  const progress = offset - start;
  if (offset >= edits.length) {
    return [progress, true];
  }

  return [progress, false];
}

function getLineNumber(l: Line | null) {
  // 読みやすい記法にできないかを調べる
  return l === null ? null : prop<Line, "number">("number")(l);
}
