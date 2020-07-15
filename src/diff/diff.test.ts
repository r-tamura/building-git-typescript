import * as assert from "power-assert";
import { stripIndent } from "../util";
import { combined } from "./diff";

describe("combined", () => {
  it.each([
    ["マージ先(left)の削除された行が出力される", ["a"], [], [], "- a"],
    ["マージ元(right)の削除された行が出力される", [], ["a"], [], " -a"],
    ["マージ先(left)に追加された行が出力される", [], ["a"], ["a"], "+ a"],
    ["マージ元(right)に追加された行が出力される", ["a"], [], ["a"], " +a"],
    ["両方(left/right)に追加された行が出力される", [], [], ["a"], "++a"],
    [
      "複数行で全ての差分パターンが出力される",
      ["alfa", "bravo", "delta\n"].join("\n"),
      ["echo", "bravo", "charlie\n"].join("\n"),
      ["echo", "bravo", "delta", "foxtort\n"].join("\n"),
      stripIndent`
      - alfa
      + echo
        bravo
       -charlie
       +delta
      ++foxtort

      `,
    ],
  ])("%s", (_, left, right, merge, expected) => {
    const actual = combined([left, right], merge);
    assert.equal(actual.join(""), expected);
  });
});
