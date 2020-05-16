import { Edit } from "./myers";
import { get, asserts } from "../util";

const HUNK_CONTEXT = 3;

export class Hunk {
  constructor(
    public a_start: number,
    public b_start: number,
    public edits: Edit[]
  ) {}

  static of(a_start: number, b_start: number, edits: Edit[]) {
    return new this(a_start, b_start, edits);
  }

  static filter(edits: Edit[]): Hunk[] {
    const hunks: Hunk[] = [];
    let offset = 0;

    while (offset < edits.length) {
      const [progress, done] = progressUntilChange(edits, offset);

      // 1つのhunkには変更行の前後3行を含める
      if (done) {
        break;
      }
      offset += progress - (HUNK_CONTEXT + 1);

      const a_start = offset < 0 ? 0 : edits[offset].a_line?.number;
      const b_start = offset < 0 ? 0 : edits[offset].b_line?.number;
      asserts(typeof a_start === "number", "a" + a_start);
      asserts(typeof b_start === "number", "b" + b_start);
      hunks.push(Hunk.of(a_start, b_start, []));
      offset = Hunk.build(get(hunks, -1), edits, offset);
    }
    return hunks;
  }

  static build(hunk: Hunk, edits: Edit[], start: number) {
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

  header() {
    const a_offset = this.offsetFor("a_line", this.a_start).join(",");
    const b_offset = this.offsetFor("b_line", this.b_start).join(",");

    return `@@ -${a_offset} +${b_offset} @@`;
  }

  private offsetFor(
    lineType: "a_line" | "b_line",
    defaultStart: number
  ): [number, number] {
    const notNull = (v: any) => v !== null;
    const lines = this.edits.map((edit) => edit[lineType]).filter(notNull);
    const start = lines[0]?.number ?? defaultStart;
    return [start, lines.length];
  }
}

function progressUntilChange(
  edits: Edit[],
  start: number
): [number, "done" | null] {
  let offset = start;
  while (edits[offset]?.type == "eql" && offset < edits.length) {
    offset += 1;
  }
  const progress = offset - start;
  if (offset >= edits.length) {
    return [progress, "done"];
  }

  return [progress, null];
}
