import * as assert from "power-assert";
import { TextDocument, lines } from "./diff";
import { Myers } from "./myers";
const tests: [string, TextDocument, TextDocument, number, string[]][] = [
  ["編集回数0", "A", "A", 0, [" A\n"]],
  ["編集回数1", "A", [], 0, ["-A\n"]],
  ["編集回数2", "A", "B", 2, ["-A\n", "+B\n"]],
  [
    "2つの文字列",
    Array.from("ABCABBA"),
    Array.from("CBABAC"),
    5,
    ["-A", "-B", " C", "+B", " A", " B", "-B", " A", "+C"],
  ],
  [
    "複数行からなる文字列",
    ["one", "two", "three"],
    ["four", "five", "six"],
    6,
    ["-one", "-two", "-three", "+four", "+five", "+six"],
  ],
  [
    "3行までの変更無し行を含む部分は同じhunkに含める",
    Array.from("ACCCA"),
    Array.from("BCCCB"),
    4,
    ["-A", "+B", " C", " C", " C", "-A", "+B"],
  ],
];

describe("Myers#diff", () => {
  it.each(tests)("%s", (_title, a, b, _expectedEditCount, expected) => {
    const myers = new Myers(lines(a), lines(b));
    const actual = myers.diff();
    assert.deepEqual(
      actual.map((e) => e.toString()),
      expected
    );
  });
});
