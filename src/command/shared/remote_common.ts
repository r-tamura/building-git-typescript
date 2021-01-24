import * as remotes from "../../remotes";
import { BaseError } from "../../util/error";

export interface Connectable {
  conn?: remotes.Protocol;
}

class NotConnected extends BaseError {}

export function checkConnected(
  conn: remotes.Protocol | undefined,
): asserts conn is remotes.Protocol {
  if (conn === undefined) {
    throw new NotConnected();
  }
}
