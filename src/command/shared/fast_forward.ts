import * as merge from "../../merge";
import { OID } from "../../types";
import * as base from "../base";

export type FastForwardError = string;

export async function fastForwardError(
  cmd: base.GitCommand,
  oldOid: OID | undefined,
  newOid: OID | undefined
): Promise<FastForwardError | undefined> {
  // fast-forward
  if (oldOid === undefined || newOid === undefined) {
    return undefined;
  }

  if (!(await cmd.repo.database.has(oldOid))) {
    return "fetch first";
  }

  if (!(await fastforward(cmd, oldOid, newOid))) {
    return "non-fast-forward";
  }

  // fast-forward
  return undefined;
}

async function fastforward(
  cmd: base.GitCommand,
  oldOid: OID,
  newOid: OID
): Promise<boolean> {
  const common = await merge.CommonAncestors.of(cmd.repo.database, oldOid, [
    newOid,
  ]);
  await common.find();
  return common.marked(oldOid, "parent2");
}
