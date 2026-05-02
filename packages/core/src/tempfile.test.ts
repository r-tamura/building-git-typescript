import { it } from "vitest";
import assert from "node:assert";
import { charsFromRange } from "./tempfile.ts";

it("アルファベットがすべて列挙できる", () => {
  // Act
  const result = charsFromRange("a", "z");

  // Assert
  assert.deepEqual(result, [
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
  ]);
});
