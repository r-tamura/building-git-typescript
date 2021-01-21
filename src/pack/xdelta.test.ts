import * as assert from "power-assert";
import { Copy, Insert } from "./delta";
import { Operation, Xdelta } from "./xdelta";

describe("Xdelta", () => {
  function insert(s: string, encoding: BufferEncoding = "utf8") {
    return new Insert(Buffer.from(s, encoding));
  }

  function assertDelta(
    source: string,
    target: string,
    expected: Operation[],
    encoding: BufferEncoding = "utf8"
  ) {
    const delta = Xdelta.createIndex(Buffer.from(source, encoding));
    const actual = delta.compress(Buffer.from(target, encoding));
    assert.deepEqual(actual, expected);
  }

  it("compresses a string", () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "a swift auburn fox jumps over three dormant hounds";

    assertDelta(source, target, [
      insert("a swift aubur"),
      new Copy(14, 19),
      insert("ree dormant hounds"),
    ]);
  });

  it("compresses as source start", () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "the quick brown ";

    assertDelta(source, target, [new Copy(0, 16)]);
  });

  it("compresses at source start with right expansion", () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "the quick brown fox hops";

    assertDelta(source, target, [new Copy(0, 20), insert("hops")]);
  });

  it("compresses at source start with left offset", () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "behold the quick brown foal";

    assertDelta(source, target, [
      insert("behold "),
      new Copy(0, 18),
      insert("al"),
    ]);
  });

  it("compresses at source end", () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "he slow lazy dog";

    assertDelta(source, target, [new Copy(32, 16)]);
  });

  it("compresses at source end with left expansion", () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "under the slow lazy dog";

    assertDelta(source, target, [insert("und"), new Copy(28, 20)]);
  });

  it("compresses at source end with right expansion", () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "under the slow lazy dog's legs";

    assertDelta(source, target, [
      insert("und"),
      new Copy(28, 20),
      insert("'s legs"),
    ]);
  });

  it("compresses unindexed bytes", () => {
    const source = "the quick brown fox";
    const target = "see the quick brown fox";

    assertDelta(source, target, [insert("see "), new Copy(0, 19)]);
  });

  it("does not compress unindexed bytes", () => {
    const source = "the quick brown fox";
    const target = "a quick brown fox";

    assertDelta(source, target, [insert("a quick brown fox")]);
  });
});
