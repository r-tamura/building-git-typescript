import * as assert from "power-assert";
import { Expander } from "./expander";
import { VarIntLE } from "./numbers";
import { Xdelta } from "./xdelta";

describe("Expander", () => {
  function compress(_source: string, _target: string) {
    const source = Buffer.from(_source);
    const target = Buffer.from(_target);

    const index = Xdelta.createIndex(source);
    const delta = index.compress(target);
    const s = VarIntLE.write(source.byteLength, 7);
    const t = VarIntLE.write(target.byteLength, 7);

    return Buffer.concat([
      s,
      t,
      Buffer.from(delta.map((op) => op.toString()).join(""), "binary"),
    ]);
  }

  it("expands encoded delta", async () => {
    const source = "the quick brown fox jumps over the slow lazy dog";
    const target = "a swift auburn fox jumps over three dormant hounds";
    const delta = compress(source, target);

    const acutal = await Expander.expand(Buffer.from(source), delta);

    assert.equal(acutal.toString(), target);
  });
});
