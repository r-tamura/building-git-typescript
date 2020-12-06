import * as crypto from "crypto";
import { readChunk } from "../services";
import * as pack from "./pack";
import { InvalidPack } from "./pack";

export class Stream {
  #input: NodeJS.ReadStream;
  digest = crypto.createHash("sha1");
  offset = 0;
  #buffer = Buffer.alloc(0);
  #capture: Buffer | null = null;
  constructor(input: NodeJS.ReadStream) {
    this.#input = input;
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

  async readByte(): Promise<number> {
    return (await this.read(1))?.[0];
  }

  async verifyChecksum() {
    const verified = (await this.read(20)) === this.digest.digest();
    if (!verified) {
      throw new InvalidPack("Checksum does not match value read from pack");
    }
  }

  async capture(callback: () => Promise<pack.Record>) {
    this.#capture = this.newByte();
    const result = [await callback(), this.#capture];
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
    const bytes = this.#capture?.slice(amount, -1);
    this.#capture = bytes;
    this.#buffer = Buffer.concat([bytes, this.#buffer]);
    this.offset += amount;
  }

  private async readBuffered(size: number, block = true) {
    const fromBuf = (this.#buffer = this.#buffer.slice(0, size));
    const needed = size - fromBuf.byteLength;

    let fromIO: Buffer | null;
    if (block) {
      fromIO = await readChunk(this.#input, needed);
    } else {
      fromIO = await Promise.resolve(this.#input.read(needed)).then(
        (res) => res ?? Buffer.alloc(0)
      );
    }

    if (fromIO) {
      return Buffer.concat([fromBuf, fromIO]);
    }
    return fromBuf;
  }

  private updateState(bytes: Buffer) {
    if (this.#capture === null) {
      this.digest.update(bytes);
    } else {
      this.#capture = Buffer.concat([this.#capture, bytes]);
    }
    this.offset += bytes.byteLength;
  }

  private newByte() {
    return Buffer.alloc(0);
  }
}
