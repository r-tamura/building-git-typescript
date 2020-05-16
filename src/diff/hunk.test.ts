import { lines, TextDocument, Line } from "./diff";
import { Myers, Edit } from "./myers";
import { Hunk } from "./hunk";
import * as assert from "power-assert";

describe("Hunk.filter", () => {
  const tests: [string, TextDocument, TextDocument, Hunk[]][] = [
    ["編集回数0", "A", "A", []],
    [
      "編集回数1",
      "A",
      [],
      [Hunk.of(0, 0, [Edit.of("del", Line.of(1, "A"), null)])],
    ],
    [
      "編集回数2",
      Array.from("AAABAAA"),
      Array.from("AAACAAA"),
      [
        Hunk.of(0, 0, [
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
        Hunk.of(0, 0, [
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
  ];
  it.each(tests)("%s", (_title, a, b, expected) => {
    // Act
    const myers = Myers.diff(lines(a), lines(b));
    const actual = Hunk.filter(myers);

    // Assert
    assert.deepEqual(actual, expected);
  });
});
