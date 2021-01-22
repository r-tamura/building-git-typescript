import * as assert from "power-assert";
import { VarIntLE } from "./numbers";
import { Xdelta } from "./xdelta";

describe("XDelta Encoding", () => {
  it.each([
    [
      "should encode xdelta data using 'insert' and 'copy' operations",
      "the quick brown fox jumps over the slow lazy dog",
      "a swift auburn fox jumps over three dormant hounds",
      // prettier-ignore
      Buffer.of(
        /* Source size */ 0x30,
        /* Target size */ 0x32,
        /* Insert */ 0x0d, 0x61, 0x20, 0x73, 0x77, 0x69, 0x66, 0x74, 0x20, 0x61, 0x75, 0x62, 0x75, 0x72,
        /* Copy */   0x91, 0x0e, 0x13,
        /* Insert */ 0x12, 0x72, 0x65, 0x65, 0x20, 0x64, 0x6f, 0x72, 0x6d, 0x61, 0x6e, 0x74, 0x20, 0x68, 0x6f, 0x75, 0x6e, 0x64, 0x73,
      ),
    ],
    [
      "should encode a just reordered target",
      "the quick brown fox jumps over the slow lazy dog",
      "over the slow lazy dog the quick brown fox jumps",
      // prettier-ignore
      Buffer.of(
        /* Source size */ 0x30,
        /* Target size */ 0x30,
        /* Insert */ 0x91, 0x1a, 0x16, 0x01, 0x20, 0x90, 0x19,
      ),
    ],
  ])(
    "%s",
    (title: string, _source: string, _target: string, expected: Buffer) => {
      const source = Buffer.from(_source);
      const target = Buffer.from(_target);

      const index = Xdelta.createIndex(source);
      const delta = index.compress(target);
      const s = VarIntLE.write(source.byteLength, 7);
      const t = VarIntLE.write(target.byteLength, 7);

      const actual = Buffer.concat([
        s,
        t,
        Buffer.from(delta.map((op) => op.toString()).join(""), "binary"),
      ]);

      assert.deepEqual(actual, expected);
    }
  );
});
