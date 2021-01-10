import * as remotes from "../remotes";
import { Environment, OID } from "../types";
import { BaseError } from "../util";
import { Base } from "./base";
import * as receive_objects from "./shared/receive_objects";
import * as remote_agent from "./shared/remote_agent";
import { checkConnected } from "./shared/remote_common";

const CAPABILITIES = ["no-thin", "report-status", "delete-refs"];

type OldNewOidPair = [oldOid: OID | undefined, newOid: OID | undefined];

export class ReceivePack extends Base {
  stdin: NodeJS.Process["stdin"];
  #requests: Record<remotes.TargetRef, OldNewOidPair> = {};
  conn!: remotes.Protocol;

  #unpackError?: Error | undefined;

  constructor(args: string[], env: Environment) {
    super(args, env);
    this.stdin = env.process?.stdin ?? process.stdin;
  }

  async run(): Promise<void> {
    remote_agent.acceptClient(this, {
      name: "receive-pack",
      capabilities: CAPABILITIES,
    });

    await remote_agent.sendReferences(this, this.env);
    await this.recvUpdateRequests();
    await receive_objects.receivePackedObjects(this);

    this.exit(0);
  }

  async recvUpdateRequests() {
    checkConnected(this.conn);
    this.#requests = {};

    for await (const line of this.conn.recvUntil(null)) {
      if (line === null) {
        throw new BaseError(`line is invalid`);
      }
      const [oldOid, newOid, ref] = line?.split(/ +/);
      this.#requests[ref] = [oldOid, newOid].map(
        this.zeroToUndefined
      ) as OldNewOidPair;
    }
  }

  zeroToUndefined(oid: string) {
    return oid === remote_agent.ZERO_OID ? undefined : oid;
  }

  async recvObjects() {
    try {
      this.#unpackError = undefined;
      if (Object.values(this.#requests).some(([_oldOid, newOid]) => newOid)) {
        await receive_objects.receivePackedObjects(this);
      }
      this.reportStatus("unpack ok");
    } catch (e: unknown) {
      const err = e as Error;
      this.#unpackError = err;
      this.reportStatus(`unpack ${err.message}`);
    }
  }

  reportStatus(line: string) {
    checkConnected(this.conn);
    if (this.conn.capable("report-status")) {
      this.conn.sendPacket(line);
    }
  }
}
