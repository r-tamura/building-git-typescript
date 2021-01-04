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

  // const readable = {
  //   read: async (size: number) => {
  //     const input = cmd.conn?.input;
  //     if (input === undefined) {
  //       return Promise.reject();
  //     }
  //     let buf = input.read(size) as Buffer | null;
  //     if (buf !== null && buf.byteLength < size) {
  //       console.log("last?");
  //       return buf;
  //     }

  //     let count = 0;
  //     while (buf === null && count < 10) {
  //       console.log("waiting");
  //       await new Promise((resolve) => {
  //         input.once("readable", () => {
  //           console.log("readable!");
  //           resolve(true);
  //         });
  //       });
  //       buf = input.read(size) as Buffer | null;
  //       count++;
  //     }
  //     return buf;
  //   },
  // } as const;

  // while (cmd.conn.input.readable) {
  //   console.log(await readable.read(5));
  //   await new Promise((resolve) => {
  //     nextTick(() => resolve(null));
  //   });
  // }

  // return;
}
