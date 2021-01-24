import { BaseError, Invalid } from "../util";
import { Hash, createHash } from "crypto";
import { IOHandle } from "../types";

export class EndOfFile extends BaseError {}

export class Checksum {
  /** チェックサムバイトサイズ */
  static CHECKSUM_SIZE = 20;

  #file: IOHandle;
  #digest: Hash;
  constructor(file: IOHandle) {
    this.#file = file;
    this.#digest = createHash("sha1");
  }

  async read(size: number) {
    const [buf, bytesRead] = await this._read(this.#file, size);
    if (bytesRead < size) {
      throw new EndOfFile("Unexpected end-of-file while reading index");
    }
    this.#digest.update(buf);
    return buf;
  }

  async write(data: Buffer) {
    await this.#file.write(data);
    this.#digest.update(data);
  }

  async writeChecksum() {
    return this.#file.write(this.#digest.copy().digest());
  }

  async verifyChecksum() {
    const [sum, read] = await this._read(this.#file, Checksum.CHECKSUM_SIZE);

    if (Buffer.compare(this.#digest.copy().digest(), sum) !== 0) {
      throw new Invalid("Checksum does not match value stored on disk");
    }
  }

  private async _read(
    file: IOHandle,
    size: number,
  ): Promise<[Buffer, number, boolean]> {
    const { bytesRead, buffer } = await file.read(
      Buffer.alloc(size),
      null,
      size,
      null,
    );
    const isEOL = bytesRead === 0;
    return [buffer, bytesRead, isEOL];
  }
}
