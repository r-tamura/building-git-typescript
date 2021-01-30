import * as pack from "../../pack";
import { Unpacker } from "../../pack/unpacker";
import { Progress } from "../../progress";
import { GitCommand } from "../base";
import { checkConnected, Connectable } from "./remote_common";

interface ReceivePackedObjects extends GitCommand, Connectable {}

export async function receivePackedObjects(
  cmd: ReceivePackedObjects,
  prefix = "",
): Promise<void> {
  checkConnected(cmd.conn);
  const stream = new pack.Stream(cmd.conn.input, prefix);
  const reader = new pack.Reader(stream);
  const progress =
    cmd.conn?.input === process.stdin ? undefined : new Progress(cmd.stderr);

  await reader.readHeader();
  const unpacker = new Unpacker(cmd.repo.database, reader, stream, progress);
  await unpacker.processPack();
}
