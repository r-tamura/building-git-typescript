import { OID } from "../types";
import * as array from "../util/array";
import { asserts } from "../util/assert";
import * as binary from "../util/binary";
import * as fsUtil from "../util/fs";
import { IDX_MAX_OFFSET } from "./pack";

const HEADER_SIZE = 0;
const FANOUT_SIZE = 1024;

const OID_LAYER = 2;
const CRC_LAYER = 3;
const OFS_LAYER = 4;
const EXT_LAYER = 5;

const SIZES = new Map<number, number>([
  [OID_LAYER, 20],
  [CRC_LAYER, 4],
  [OFS_LAYER, 4],
  [EXT_LAYER, 8],
]);

export class Index {
  #input: fsUtil.Seekable;
  #fanout: number[] = [];
  static async fromSeekable(input: fsUtil.Seekable): Promise<Index> {
    const index = new this(input);
    await index.loadFanoutTable();
    return index;
  }

  private constructor(input: fsUtil.Seekable) {
    this.#input = input;
  }

  async oidOffset(oid: OID): Promise<number | undefined> {
    const pos = await this.oidPosition(oid);
    if (pos < 0) {
      return undefined;
    }

    const offset = await this.readInt32(OFS_LAYER, pos);
    if (offset < IDX_MAX_OFFSET) {
      // 2GB以下の場合
      return offset;
    }

    const posLargeFile = offset & (IDX_MAX_OFFSET - 1);
    this.#input.seek(this.offsetFor(EXT_LAYER, posLargeFile));
    return array.first(
      binary.unpackUsLong(await this.#input.read(binary.LNG_SIZE)),
    );
  }

  private async loadFanoutTable(): Promise<void> {
    this.#input.seek(HEADER_SIZE);
    const buffer = await this.#input.read(FANOUT_SIZE);
    this.#fanout = binary.unpackUsInt(buffer);
    asserts(this.#fanout.length === 256);
  }

  private async readInt32(layer: number, pos: number): Promise<number> {
    this.#input.seek(this.offsetFor(layer, pos));
    return array.first(binary.unpackUsInt(await this.#input.read(4)));
  }

  private offsetFor(layer: number, pos: number): number {
    let offset = HEADER_SIZE + FANOUT_SIZE;
    const count = array.last(this.#fanout);

    for (const [n, size] of SIZES) {
      if (n < layer) {
        offset += size * count;
      }
    }
    const layerSize = SIZES.get(layer);
    asserts(layerSize !== undefined);
    return offset + pos * layerSize;
  }

  private async oidPosition(oid: OID) {
    const prefix = Number.parseInt(oid.slice(0, 2), 16); // 0x00 - 0xff
    // const packed = binary.packHex(oid);

    const low = prefix === 0 ? 0 : this.#fanout[prefix - 1];
    const high = this.#fanout[prefix] - 1;

    return await this.binarysearch(oid, low, high);
  }

  private async binarysearch(
    target: OID,
    low: number,
    high: number,
  ): Promise<number> {
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      this.#input.seek(this.offsetFor(OID_LAYER, mid));
      const oid = await this.readOid();

      if (oid > target) {
        low = mid + 1;
      } else if (oid === target) {
        return mid;
      } else {
        high = mid - 1;
      }
    }

    return -1 - low;
  }

  async prefixMatch(name: string): Promise<OID[]> {
    const pos = await this.oidPosition(name);
    if (pos < 0) {
      return [name];
    }

    this.#input.seek(this.offsetFor(OID_LAYER, -1 - pos));
    const oids = [] as OID[];
    while (true) {
      const oid = await this.readOid();
      if (!oid.startsWith(name)) {
        return oids;
      }
      oids.push(oid);
    }
  }

  private async readOid(): Promise<OID> {
    const oidBytes = await this.#input.read(20);
    return binary.unpackHex(oidBytes);
  }
}
