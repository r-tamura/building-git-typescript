import { lines, TextDocument, Line, combinedHunk } from "./diff";
import { Myers, Edit } from "./myers";
import { Hunk } from "./hunk";
import * as assert from "power-assert";
import { Row } from "./combined";

describe("Hunk.filter", () => {
  describe("通常diff", () => {
    const tests: [string, TextDocument, TextDocument, Hunk[]][] = [
      ["編集回数0", "A", "A", []],
      [
        "編集回数1",
        "A",
        [],
        [Hunk.of([], null, [Edit.of("del", Line.of(1, "A"), null)])],
      ],
      [
        "編集回数2",
        Array.from("AAABAAA"),
        Array.from("AAACAAA"),
        [
          Hunk.of([], null, [
            Edit.of("eql", Line.of(1, "A"), Line.of(1, "A")),
            Edit.of("eql", Line.of(2, "A"), Line.of(2, "A")),
            Edit.of("eql", Line.of(3, "A"), Line.of(3, "A")),
            Edit.of("del", Line.of(4, "B"), null),
            Edit.of("ins", null, Line.of(4, "C")),
            Edit.of("eql", Line.of(5, "A"), Line.of(5, "A")),
            Edit.of("eql", Line.of(6, "A"), Line.of(6, "A")),
            Edit.of("eql", Line.of(7, "A"), Line.of(7, "A")),
          ]),
        ],
      ],
      [
        "3行までの変更無し行を含む部分は同じhunkに含める",
        Array.from("ACCCA"),
        Array.from("BCCCB"),
        [
          Hunk.of([], null, [
            Edit.of("del", Line.of(1, "A"), null),
            Edit.of("ins", null, Line.of(1, "B")),
            Edit.of("eql", Line.of(2, "C"), Line.of(2, "C")),
            Edit.of("eql", Line.of(3, "C"), Line.of(3, "C")),
            Edit.of("eql", Line.of(4, "C"), Line.of(4, "C")),
            Edit.of("del", Line.of(5, "A"), null),
            Edit.of("ins", null, Line.of(5, "B")),
          ]),
        ],
      ],
      [
        "最初から3行目より後で差分が存在するとき、前後3行までの変更無し行を含む部分は同じhunkに含める",
        Array.from("CCCCACCCA"),
        Array.from("CCCCBCCCB"),
        [
          Hunk.of([1], 1, [
            Edit.of("eql", Line.of(2, "C"), Line.of(2, "C")),
            Edit.of("eql", Line.of(3, "C"), Line.of(3, "C")),
            Edit.of("eql", Line.of(4, "C"), Line.of(4, "C")),
            Edit.of("del", Line.of(5, "A"), null),
            Edit.of("ins", null, Line.of(5, "B")),
            Edit.of("eql", Line.of(6, "C"), Line.of(6, "C")),
            Edit.of("eql", Line.of(7, "C"), Line.of(7, "C")),
            Edit.of("eql", Line.of(8, "C"), Line.of(8, "C")),
            Edit.of("del", Line.of(9, "A"), null),
            Edit.of("ins", null, Line.of(9, "B")),
          ]),
        ],
      ],
    ];
    it.each(tests)("%s", (_title, a, b, expected) => {
      // Act
      const myers = Myers.diff(lines(a), lines(b));
      const actual = Hunk.filter(myers);

      // Assert
      assert.deepEqual(actual, expected);
    });
  });

  describe("combined diff", () => {
    it.each([
      [
        "最初から3行目より後で差分が存在するとき、前後3行までの変更無し行を含む部分は同じhunkに含める",
        [Array.from("CCCCCCCA"), Array.from("CCCCBCCC")],
        Array.from("CCCCBCCCA"),
        [
          Hunk.of([1, 1], 1, [
            Row.of([
              Edit.of("eql", Line.of(2, "C"), Line.of(2, "C")),
              Edit.of("eql", Line.of(2, "C"), Line.of(2, "C")),
            ]),
            Row.of([
              Edit.of("eql", Line.of(3, "C"), Line.of(3, "C")),
              Edit.of("eql", Line.of(3, "C"), Line.of(3, "C")),
            ]),
            Row.of([
              Edit.of("eql", Line.of(4, "C"), Line.of(4, "C")),
              Edit.of("eql", Line.of(4, "C"), Line.of(4, "C")),
            ]),
            Row.of([
              Edit.of("ins", null, Line.of(5, "B")),
              Edit.of("eql", Line.of(5, "B"), Line.of(5, "B")),
            ]),
            Row.of([
              Edit.of("eql", Line.of(5, "C"), Line.of(6, "C")),
              Edit.of("eql", Line.of(6, "C"), Line.of(6, "C")),
            ]),
            Row.of([
              Edit.of("eql", Line.of(6, "C"), Line.of(7, "C")),
              Edit.of("eql", Line.of(7, "C"), Line.of(7, "C")),
            ]),
            Row.of([
              Edit.of("eql", Line.of(7, "C"), Line.of(8, "C")),
              Edit.of("eql", Line.of(8, "C"), Line.of(8, "C")),
            ]),
            Row.of([
              Edit.of("eql", Line.of(8, "A"), Line.of(9, "A")),
              Edit.of("ins", null, Line.of(9, "A")),
            ]),
          ]),
        ],
      ],
    ])("%s", (_, [a1, a2], b, expected) => {
      const actual = combinedHunk([a1, a2], b);
      assert.deepEqual(actual, expected);
    });
  });
});
