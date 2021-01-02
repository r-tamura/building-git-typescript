import * as crypto from "crypto";
import { readChunk } from "../services";
import * as pack from "./pack";
import { InvalidPack } from "./pack";

const to_s = (buf: Buffer) =>
  [...buf].map((b) => b.toString(16).padStart(2, "0")).join(" ");

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
    console.log({ captured: to_s(result[0].data) });
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
    const bytes = this.#capture.slice(amount);
    this.#capture = this.#capture.slice(0, this.#capture.byteLength + amount);

    this.#buffer = Buffer.concat([bytes, this.#buffer]);
    console.log("data added to buffer", {
      prepended: to_s(bytes),
      buffer: to_s(this.#buffer),
      bufferSize: this.#buffer.byteLength,
    });
    this.offset += amount;
  }

  private async readBuffered(size: number, block = true): Promise<Buffer> {
    if (this.#buffer.byteLength < size && block) {
      console.warn({
        buffer: this.#buffer,
        byteLength: this.#buffer.byteLength,
        neededSize: size,
      });
    }
    console.log("data read from buffer", {
      readSize: Math.min(this.#buffer.byteLength, size),
      buffer: to_s(this.#buffer),
      bufferSizeAfter: Math.max(this.#buffer.byteLength - size, 0),
    });
    const fromBuf = this.#buffer.slice(0, size);
    this.#buffer = this.#buffer.slice(size);
    if (this.#buffer.byteLength === 0) {
      console.warn("buffer got empty!");
    }
    const needed = size - fromBuf.byteLength;

    if (needed === 0) {
      return fromBuf;
    }

    let fromIO: Buffer | null = null;
    if (block) {
      fromIO = await readChunk(this.#input, needed);
    } else {
      if (this.#input.readable) {
        fromIO = await new Promise<Buffer | null>((resolve, reject) => {
          this.#input.once("data", (read: Buffer) => {
            if (read.byteLength > needed) {
              const onlyNeeded = read.slice(0, needed);
              const rest = read.slice(needed);
              this.#buffer = Buffer.concat([this.#buffer, rest]);
              resolve(onlyNeeded);
            } else {
              resolve(read);
            }
          });
        }).then((res) =>
          typeof res === "string" ? Buffer.from(res) : res ?? null
        );
      }
    }
    // console.log("stream", {
    //   fromBuf: [...fromBuf]
    //     .map((byte) => byte.toString(16).padStart(2, "0"))
    //     .join(" "),
    //   fromIO: [...(fromIO ?? [])]
    //     .map((byte) => byte.toString(16).padStart(2, "0"))
    //     .join(" "),
    // });
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
