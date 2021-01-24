import { Diff3 } from "./diff3";
import * as assert from "power-assert";
import { stripIndent } from "../util";

describe("Diff3.merge", () => {
  it.each([
    [
      "cleanly merges two lists",
      ["a", "b", "c"],
      ["d", "b", "c"],
      ["a", "b", "e"],
      "dbe",
      true,
    ],
    [
      "cleanly merges two lists with the same edit",
      ["a", "b", "c"],
      ["d", "b", "c"],
      ["d", "b", "c"],
      "dbc",
      true,
    ],
    [
      "uncleanly merges two lists",
      ["a", "b", "c"],
      ["d", "b", "c"],
      ["e", "b", "c"],
      stripIndent`
      <<<<<<<
      d=======
      e>>>>>>>
      bc
      `,
      false,
    ],
    [
      "uncleanly merges two lists against an empty list",
      [],
      ["d", "b", "c"],
      ["e", "b", "c"],
      stripIndent`
      <<<<<<<
      dbc=======
      ebc>>>>>>>

      `,
      false,
    ],
  ])("%s", (_, o, a, b, expected, isClean) => {
    const actual = Diff3.merge(o, a, b);

    assert.equal(actual.clean(), isClean);
    assert.equal(actual.toString(), expected);
  });

  it("コンフリクト部分のdiffを返す", () => {
    const orig = [
      "celery",
      "garlic",
      "onions",
      "salmon",
      "tomatoes",
      "wine",
    ].join("\n");
    const left = [
      "celery",
      "salmon",
      "tomatoes",
      "garlic",
      "onions",
      "wine",
    ].join("\n");
    const right = [
      "celery",
      "salmon",
      "garlic",
      "onions",
      "tomatoes",
      "wine",
    ].join("\n");

    // Act
    const actual = Diff3.merge(orig, left, right);

    // Assert
    assert.equal(
      actual.toString("left.txt", "right.txt"),
      stripIndent`
      celery
      <<<<<<< left.txt
      salmon
      =======
      salmon
      garlic
      onions
      >>>>>>> right.txt
      tomatoes
      garlic
      onions
      wine
    `,
    );
  });
});
