import * as pack from "../../pack";
import { GitCommand } from "../base";
import { checkConnected, Connectable } from "./remote_common";

interface ReceiveObjects extends GitCommand, Connectable {}

export async function receiveObjects(cmd: ReceiveObjects, prefix = "") {
  checkConnected(cmd.conn);
  const stream = new pack.Stream(cmd.conn.input, prefix);
  const reader = new pack.Reader(stream);

  await reader.readHeader();
  for (let i = 0; i < reader.count; i++) {
    const [record, _] = await stream.capture(() => reader.readRecord());
    await cmd.repo.database.store(record);
  }
  await stream.verifyChecksum();
}
