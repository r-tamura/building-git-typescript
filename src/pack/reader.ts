import { TextDecoder } from "util";
import { defaultZlib, readChunk, Zlib } from "../services";
import { asserts, BaseError, includes, isNodeError } from "../util";
import * as numbers from "./numbers";
import * as pack from "./pack";
import { HEADER_SIZE, SIGNATURE, VERSION } from "./pack";

class InvalidPack extends BaseError {}

interface Environment {
  zlib?: Zlib;
}

export class Reader {
  #input: NodeJS.ReadStream;
  /** Pack内のオブジェクト数 */
  #count = 0;
  #zlib: Zlib;
  constructor(input: NodeJS.ReadStream, env: Environment = {}) {
    this.#input = input;
    this.#zlib = env.zlib ?? defaultZlib;
  }

  readHeader() {
    /*
     *   4 Bytes                4 Bytes              4 Bytes
     *   +---------------------+--------------------+--------------------+
     *   |  Signature          | Version            | Object counts      |
     *   +---------------------+--------------------+--------------------+
     */
    const data: Uint32Array = this.#input.read(HEADER_SIZE);

    // ruby: data.unpack(HEADER_FORMAT)
    const decorder = new TextDecoder();
    const signature = decorder.decode(data.slice(0, 1));
    const version = data[1];
    this.#count = data[2];

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
    let body = null;
    let bodyDeflated = Buffer.alloc(0);
    let total = 0;
    while (!finished) {
      const chunk = await readChunk(this.#input, 256);
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
    // TODO: seek

    return body ?? Buffer.alloc(0);
  }
}
