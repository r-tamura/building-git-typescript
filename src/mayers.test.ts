import * as assert from "power-assert";
import { TextDocument } from "./diff";
import { Myers } from "./myers";
const tests: [string, TextDocument, TextDocument, number, string[]][] = [
  ["編集回数0", "A", "A", 0, [" A"]],
  ["編集回数1", "A", "B", 2, ["-A", "+B"]],
  [
    "2つの文字列",
    "ABCABBA",
    "CBABAC",
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
];
describe("Myers#shortestEdit", () => {
  it.each(tests)("%s", (_title, a, b, expected) => {
    // Act
    const myers = Myers.diff(Array.from(a), Array.from(b));
    const actual = myers.shortestEdit();

    // Assert
    assert.equal(actual.length - 1, expected);
  });
});

describe("Myers#diff", () => {
  it.each(tests)("%s", (_title, a, b, expectedEditCount, expected) => {
    const myers = new Myers(Array.from(a), Array.from(b));
    const actual = myers.diff();
    assert.deepEqual(
      actual.map((e) => e.toString()),
      expected
    );
  });
});
