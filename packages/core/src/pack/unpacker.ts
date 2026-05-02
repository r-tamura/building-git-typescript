import type * as database from "../database";
import type * as progress from "../progress";
import type { OID } from "../types";
import type { Reader, Stream } from "./";
import { Expander } from "./expander";
import type { RefDelta } from "./pack";
import { Record } from "./pack";

export class Unpacker {
  #database: database.Database;
  #reader: Reader;
  #stream: Stream;
  #progress?: progress.Progress;
  constructor(
    database: database.Database,
    reader: Reader,
    stream: Stream,
    progress?: progress.Progress,
  ) {
    this.#database = database;
    this.#reader = reader;
    this.#stream = stream;
    this.#progress = progress;
  }

  async processPack(): Promise<void> {
    this.#progress?.start("Unpacking objects", this.#reader.count);

    for (let i = 0; i < this.#reader.count; i++) {
      await this.processRecord();
      this.#progress?.tick(this.#stream.offset);
    }
    this.#progress?.stop();

    await this.#stream.verifyChecksum();
  }

  private async processRecord(): Promise<void> {
    const [recordOrRefDelta] = await this.#stream.capture(() =>
      this.#reader.readRecord(),
    );
    const record = await this.resolve(recordOrRefDelta);
    await this.#database.store(record);
  }

  private async resolve(record: Record | RefDelta): Promise<Record> {
    switch (record.kind) {
      case "record":
        return record;
      case "refdelta":
        return this.resolveRefDelta(record);
    }
  }

  private async resolveRefDelta(delta: RefDelta): Promise<Record> {
    return await this.resolveDelta(delta.baseOid, delta.deltaData);
  }

  private async resolveDelta(oid: OID, deltaData: Buffer): Promise<Record> {
    const base = await this.#database.loadRaw(oid);
    const data = await Expander.expand(base.data, deltaData);
    return Record.of(base.type, data);
  }
}
