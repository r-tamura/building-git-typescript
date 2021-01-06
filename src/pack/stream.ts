import * as crypto from "crypto";
import { readChunk } from "../services";
import { BaseError } from "../util";
import * as pack from "./pack";
import { InvalidPack } from "./pack";

const to_s = (buf: Buffer, strip = true) => {
  const s = [...buf].map((b) => b.toString(16).padStart(2, "0")).join(" ");

  if (strip === false || buf.byteLength < 21) {
    return s;
  }

  return s.slice(0, 2 * 10 + 10) + "..." + s.slice(-1 * (2 * 10 + 10));
};

class StreamEndedError extends BaseError {}

interface ReadableStream extends NodeJS.ReadableStream {
  // TypeScriptのNodeJS型定義にreadableEndedが定義されていない
  // https://nodejs.org/api/stream.html#stream_readable_readableended
  readableEnded: boolean;
}
export class Stream {
  #input: NodeJS.ReadableStream;
  digest = crypto.createHash("sha1");
  offset = 0;
  #buffer = Buffer.alloc(0);
  #capture: Buffer | null = null;
  constructor(input: NodeJS.ReadableStream, prefix = "") {
    this.#input = input;
    this.#buffer = Buffer.concat([this.#buffer, Buffer.from(prefix, "utf8")]);
  }

  async read(size: number): Promise<Buffer> {
    const bytes = await this.readBuffered(size);
    this.updateState(bytes);
    return bytes;
  }

  async readNonblock(size: number): Promise<Buffer> {
    const bytes = await this.readBuffered(size, false);
    this.updateState(bytes);
    return bytes;
  }

  async readByte(): Promise<number | null> {
    return (await this.read(1))[0] ?? null;
  }

  async verifyChecksum(): Promise<void> {
    const expected = await this.read(20);
    const actual = this.digest.digest();
    const verified = Buffer.compare(expected, actual) === 0;
    if (!verified) {
      throw new InvalidPack("Checksum does not match value read from pack");
    }
  }

  async capture(
    callback: () => Promise<pack.Record>
  ): Promise<readonly [pack.Record, Buffer]> {
    this.#capture = this.newByte();
    const result = [await callback(), this.#capture] as const;
    this.digest.update(this.#capture);
    this.#capture = null;
    return result;
  }

  // TODO: whenceの型を調べる
  seek(amount: number, whence?: any) {
    if (amount >= 0) {
      return;
    }
    if (this.#capture === null) {
      throw new Error("There are no data captured.");
    }

    // ruby: Array#slice!(amount .. -1)
    const prependBytes = this.#capture.slice(amount);
    const captureRest = this.#capture.slice(
      0,
      this.#capture.byteLength + amount
    );
    const nextBuffer = Buffer.concat([prependBytes, this.#buffer]);
    // log({
    //   event: "seek",
    //   amount,
    //   prepended: to_s(prependBytes),
    //   captureRest: to_s(captureRest),
    //   bufferBefore: to_s(this.#buffer),
    //   bufferBeforeSize: this.#buffer.byteLength,
    //   bufferAfter: to_s(nextBuffer),
    //   bufferAfterSize: nextBuffer.byteLength,
    // });
    this.#capture = captureRest;
    this.#buffer = nextBuffer;
    this.offset += amount;
  }

  private async readBuffered(size: number, block = true): Promise<Buffer> {
    const fromBuf = this.#buffer.slice(0, size);
    this.#buffer = this.#buffer.slice(size);
    const needed = size - fromBuf.byteLength;

    if (needed === 0) {
      return fromBuf;
    }

    if (!this.#input.readable && !block) {
      return fromBuf;
    }

    const fromIO = await readChunk(this.#input, needed, { block });
    if (fromIO !== null) {
      return Buffer.concat([fromBuf, fromIO]);
    }
    return fromBuf;
  }

  private updateState(bytes: Buffer): void {
    if (this.#capture !== null) {
      this.#capture = Buffer.concat([this.#capture, bytes]);
    }
    this.offset += bytes.byteLength;
  }

  private newByte() {
    return Buffer.alloc(0);
  }
}
