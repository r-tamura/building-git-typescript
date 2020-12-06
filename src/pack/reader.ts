import { TextDecoder } from "util";
import { defaultZlib, Zlib } from "../services";
import { asserts, includes, isNodeError } from "../util";
import * as numbers from "./numbers";
import * as pack from "./pack";
import { HEADER_SIZE, InvalidPack, SIGNATURE, VERSION } from "./pack";
import { Stream } from "./stream";

interface Environment {
  zlib?: Zlib;
}

export class Reader {
  #input: Stream;
  /** Pack内のオブジェクト数 */
  #count = 0;
  #zlib: Zlib;
  constructor(input: Stream, env: Environment = {}) {
    this.#input = input;
    this.#zlib = env.zlib ?? defaultZlib;
  }

  async readHeader() {
    /*
     *   4 Bytes                4 Bytes              4 Bytes
     *   +---------------------+--------------------+--------------------+
     *   |  Signature          | Version            | Object counts      |
     *   +---------------------+--------------------+--------------------+
     */
    const buf = await this.#input.read(HEADER_SIZE);
    const bytes32 = new Uint32Array(buf);

    // ruby: data.unpack(HEADER_FORMAT)
    const decorder = new TextDecoder();
    const signature = decorder.decode(bytes32.slice(0, 1));
    const version = bytes32[1];
    this.#count = bytes32[2];

    if (signature !== SIGNATURE) {
      throw new InvalidPack(`bad pack signature: ${signature}`);
    }

    if (version !== VERSION) {
      throw new InvalidPack(`unsupported pack version: ${version}`);
    }
  }

  async readRecord() {
    const [type, _] = await this.readRecordHeader();
    const typeNames = Object.keys(
      pack.TYPE_CODES
    ) as (keyof typeof pack.TYPE_CODES)[];
    const typeName = typeNames.find((name) => pack.TYPE_CODES[name] === type);

    asserts(includes(typeName, typeNames));
    return pack.Record.of(typeName, await this.readZlibStream());
  }

  private async readRecordHeader(): Promise<
    [type: pack.GitObjectType, size: number]
  > {
    const [byte, size] = await numbers.VarIntLE.read(this.#input);
    const type = (byte >> 4) & numbers.MASK_FOR_FIRST;
    asserts(type === pack.COMMIT || type === pack.TREE || type === pack.BLOB);
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
        if (isNodeError(e) && e.code === "Z_BUF_ERROR") {
          // not enough data to inflate
          continue;
        }
        throw e;
      }
    }
    if (body === null) {
      throw new TypeError("couldn't find deflated data");
    }

    // zlib#inflateによって処理されたバイト数
    const totalIn = bodyDeflated.byteLength;
    this.#input.seek(totalIn - total);

    return body;
  }
}
