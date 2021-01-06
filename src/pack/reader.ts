import { TextDecoder } from "util";
import * as zlib from "zlib";
import { defaultZlib, Zlib } from "../services";
import { asserts, includes, isNodeError } from "../util";
import * as numbers from "./numbers";
import * as pack from "./pack";
import { HEADER_SIZE, InvalidPack, SIGNATURE, VERSION } from "./pack";
import { Stream } from "./stream";

interface Environment {
  zlib?: Zlib;
}

type RecordHeader = [type: pack.GitObjectType, size: number];

export class Reader {
  #input: Stream;
  /** Pack内のオブジェクト数 */
  count = 0;
  #zlib: Zlib;
  constructor(input: Stream, env: Environment = {}) {
    this.#input = input;
    this.#zlib = env.zlib ?? defaultZlib;
  }

  async readHeader(): Promise<void> {
    /*
     *   4 Bytes                4 Bytes              4 Bytes
     *   +---------------------+--------------------+--------------------+
     *   |  Signature          | Version            | Object counts      |
     *   +---------------------+--------------------+--------------------+
     */
    const buf = await this.#input.read(HEADER_SIZE);

    // ruby: data.unpack(HEADER_FORMAT)
    const decorder = new TextDecoder();
    const signature = decorder.decode(buf.slice(0, 4));
    const version = buf.readUInt32BE(4);
    this.count = buf.readUInt32BE(8);

    if (signature !== SIGNATURE) {
      throw new InvalidPack(`bad pack signature: ${signature}`);
    }

    if (version !== VERSION) {
      throw new InvalidPack(`unsupported pack version: ${version}`);
    }
  }

  async readRecord(): Promise<pack.Record> {
    const [type, _] = await this.readRecordHeader();
    const typeNames = Object.keys(
      pack.TYPE_CODES
    ) as (keyof typeof pack.TYPE_CODES)[];
    const typeName = typeNames.find((name) => pack.TYPE_CODES[name] === type);

    asserts(includes(typeName, typeNames));
    return pack.Record.of(typeName, await this.readZlibStream());
  }

  private async readRecordHeader(): Promise<RecordHeader> {
    const [byte, size] = await numbers.VarIntLE.read(this.#input);
    const type = (byte >> 4) & numbers.OBJECT_TYPE_MASK;
    asserts(
      type === pack.COMMIT || type === pack.TREE || type === pack.BLOB,
      `needs 1, 2, or 3, got ${type}`
    );
    return [type, size];
  }

  private async readZlibStream() {
    let finished = false;
    let body: Buffer | null = null;
    let bodyDeflated = Buffer.alloc(0);
    let total = 0;

    while (!finished) {
      const chunk = await this.#input.readNonblock(256);
      total += chunk.byteLength;

      bodyDeflated = Buffer.concat([bodyDeflated, chunk]);
      try {
        body = await this.#zlib.inflate(bodyDeflated);
        finished = true;
      } catch (e: unknown) {
        if (isNodeError(e)) {
          switch (e.code) {
            // not enough data to inflate
            case "Z_BUF_ERROR":
              continue;
          }
        }
        throw e;
      }
    }
    asserts(body !== null);

    // zlib#inflateによって処理されたバイト数
    // TODO: zlib#inflateでbytesWrittenが取得できない。ストリームのクラスを使う必要があるか。
    const totalIn = (
      await this.#zlib.deflate(body, {
        level: zlib.constants.Z_DEFAULT_COMPRESSION,
      })
    ).byteLength;

    this.#input.seek(totalIn - total);

    return body;
  }
}
