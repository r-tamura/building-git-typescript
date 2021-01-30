import * as database from "../../database";
import * as pack from "../../pack";
import { Unpacker } from "../../pack";
import { Indexer } from "../../pack/indexer";
import { Progress } from "../../progress";
import { asserts } from "../../util";
import { GitCommand } from "../base";
import { checkConnected, Connectable } from "./remote_common";

interface ReceivePackedObjects extends GitCommand, Connectable {}

export async function receivePackedObjects(
  cmd: ReceivePackedObjects,
  { unpackLimit, prefix = "" }: { unpackLimit?: number; prefix?: string } = {},
): Promise<void> {
  checkConnected(cmd.conn);
  const stream = new pack.Stream(cmd.conn.input, prefix);
  const reader = new pack.Reader(stream);
  const progress =
    cmd.conn?.input === process.stdin ? undefined : new Progress(cmd.stderr);

  await reader.readHeader();

  const Factory = await selectProcessorClass(cmd, reader, unpackLimit);
  const processor = new Factory(cmd.repo.database, reader, stream, progress);

  await processor.processPack();
}

interface ObjectProcessorConstructor {
  new (
    database: database.Database,
    reader: pack.Reader,
    stream: pack.Stream,
    progress?: Progress,
  ): ObjectProcessor;
}
interface ObjectProcessor {
  processPack: () => Promise<void>;
}

async function selectProcessorClass(
  cmd: ReceivePackedObjects,
  reader: pack.Reader,
  unpackLimit?: number,
): Promise<ObjectProcessorConstructor> {
  unpackLimit ??= await transferUnpackLimit(cmd);

  if (unpackLimit && reader.count > unpackLimit) {
    return Indexer;
  } else {
    return Unpacker;
  }
}

async function transferUnpackLimit(
  cmd: ReceivePackedObjects,
): Promise<number | undefined> {
  const unpackLimit = await cmd.repo.config.get(["transfer", "unpackLimit"]);
  asserts(typeof unpackLimit === "number" || unpackLimit === undefined);
  return unpackLimit;
}
