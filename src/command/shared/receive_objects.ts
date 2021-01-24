import * as pack from "../../pack";
import { Progress } from "../../progress";
import { GitCommand } from "../base";
import { checkConnected, Connectable } from "./remote_common";

interface ReceivePackedObjects extends GitCommand, Connectable {}

export async function receivePackedObjects(
  cmd: ReceivePackedObjects,
  prefix = "",
) {
  checkConnected(cmd.conn);
  const stream = new pack.Stream(cmd.conn.input, prefix);
  const reader = new pack.Reader(stream);
  const progress =
    cmd.conn?.input === process.stdin ? undefined : new Progress(cmd.stderr);

  await reader.readHeader();
  progress?.start("Unpacking objects", reader.count);

  for (let i = 0; i < reader.count; i++) {
    const [record, _] = await stream.capture(() => reader.readRecord());
    await cmd.repo.database.store(record);
    progress?.tick(stream.offset);
  }
  progress?.stop();

  await stream.verifyChecksum();
}
