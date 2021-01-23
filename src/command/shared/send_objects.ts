import * as pack from "../../pack";
import * as rev_list from "../../rev_list";
import { GitCommand } from "../base";
import { checkConnected, Connectable } from "./remote_common";

interface SendObject extends GitCommand, Connectable {}

export async function sendPackedObjects(cmd: SendObject, revs: string[]) {
  checkConnected(cmd.conn);
  const rev_options = { objects: true, missing: true } as const;
  const revList = await rev_list.RevList.fromRevs(cmd.repo, revs, rev_options);

  const packCompression =
    (await cmd.repo.config.get(["pack", "compression"])) ||
    (await cmd.repo.config.get(["core", "compress"]));

  if (packCompression !== undefined && typeof packCompression !== "number") {
    throw new TypeError("compress level requires to be number type");
  }

  const write_options = { compressLevel: packCompression } as const;
  const writer = new pack.Writer(
    cmd.conn.output,
    cmd.repo.database,
    write_options
  );
  await writer.writeObjects(revList);
}
