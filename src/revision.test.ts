import { Ref, Parent, Ancestor, Revision, Rev } from "./revision";
import * as assert from "power-assert";

describe("Revision.parse", () => {
  type Test = [string, string, Rev];
  it.each([
    ["エイリアス", "@^", Parent.of(Ref.of("HEAD"))],
    ["~(数字)", "HEAD~42", Ancestor.of(Ref.of("HEAD"), 42)],
    ["^", "HEAD^^", Parent.of(Parent.of(Ref.of("HEAD")))],
    ["~と^の混合", "abc123~3^", Parent.of(Ancestor.of(Ref.of("abc123"), 3))],
  ] as Test[])("%s", (_tilte, revision, expected) => {
    // Act
    const actual = Revision.parse(revision);

    // Assert
    assert.deepEqual(actual, expected);
  });
});
