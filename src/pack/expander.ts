import { asserts, BaseError } from "../util";
import * as delta from "./delta";
import * as numbers from "./numbers";

export class Expander {
  #delta: numbers.Readable;
  #sourceSize = 0;
  #targetSize = 0;
  static async expand(source: Buffer, delta: Buffer): Promise<Buffer> {
    const expander = new Expander(delta);
    expander.#sourceSize = await expander.readSize();
    expander.#targetSize = await expander.readSize();

    return expander.expand(source);
  }

  private constructor(delta: Buffer) {
    this.#delta = numbers.fromBuffer(delta);
  }

  async expand(source: Buffer): Promise<Buffer> {
    this.checkSize(source, this.#sourceSize);
    let target = Buffer.alloc(0);

    while (!this.#delta.readableEnded) {
      const byte = await this.#delta.readByte();
      asserts(byte !== null);

      if (delta.Insert.isInsert(byte)) {
        const insert = await delta.Insert.parse(this.#delta, byte);
        target = Buffer.concat([target, insert.data]);
      } else {
        const copy = await delta.Copy.parse(this.#delta, byte);
        target = Buffer.concat([
          target,
          source.slice(copy.offset, copy.offset + copy.size),
        ]);
      }
    }

    this.checkSize(target, this.#targetSize);
    return target;
  }

  private async readSize(): Promise<number> {
    return (await numbers.VarIntLE.read(this.#delta, 7))[1];
  }

  private checkSize(buffer: Buffer, size: number) {
    if (buffer.byteLength !== size) {
      throw new BaseError("failed to apply delta");
    }
  }
}
