import { BaseError } from "../../util";
import { GitCommand } from "../base";
import { Connectable } from "./remote_common";

const REF_LINE = /^([0-9a-f]+)(.*)$/;
const ZERO_OID = "0".repeat(40);

interface RemoteClient extends GitCommand, Connectable {
  remoteRefs: Record<string, string>;
}

export async function recvReferences(cmd: RemoteClient) {
  for await (const line of cmd.conn.recvUntil(null)) {
    if (line === null) {
      continue;
    }
    const match = REF_LINE.exec(line);
    if (match === null) {
      throw new BaseError(`Invalid record: ${line}`);
    }
    const [_, oid, ref] = match;
    if (oid === ZERO_OID) {
      continue;
    }
    cmd.remoteRefs[ref] = oid.toLowerCase();
  }
}
