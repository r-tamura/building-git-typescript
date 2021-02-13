import * as crypto from "crypto";
import * as fs from "fs";
import { readChunk } from "../services";
import { Pathname } from "../types";
import * as fsUtil from "../util/fs";
import * as pack from "./pack";
import { InvalidPack } from "./pack";
export class Stream implements fsUtil.Seekable {
  #input: NodeJS.ReadableStream;
  digest = crypto.createHash("sha1");
  offset = 0;
  #buffer = Buffer.alloc(0);
  #capture: Buffer | null = null;

  static fromFs(pathname: Pathname): Stream {
    return new Stream(fs.createReadStream(pathname));
  }

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
    callback: () => Promise<pack.Record | pack.RefDelta>,
  ): Promise<readonly [pack.Record | pack.RefDelta, Buffer]> {
    this.#capture = this.newByte();
    const result = [await callback(), this.#capture] as const;
    this.digest.update(this.#capture);
    this.#capture = null;
    return result;
  }

  // TODO: whenceの型を調べる
  seek(amount: number, whence: fsUtil.Whence = "SEEK_SET") {
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
      this.#capture.byteLength + amount,
    );
    const nextBuffer = Buffer.concat([prependBytes, this.#buffer]);
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

  get readableEnded(): boolean {
    return !this.#input.readable;
  }
}
