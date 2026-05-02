import type * as remotes from "@kit/core/remotes";
import type { Environment, OID } from "@kit/core/types";
import { asserts, BaseError, unreachable } from "@kit/core/util";
import { BaseCommand } from "./base.js";
import * as fast_forward from "./shared/fast_forward.js";
import * as receive_objects from "./shared/receive_objects.js";
import * as remote_agent from "./shared/remote_agent.js";
import { checkConnected } from "./shared/remote_common.js";

const CAPABILITIES = ["no-thin", "report-status", "delete-refs"];

type OldNewOidPair = [oldOid: OID | undefined, newOid: OID | undefined];

export class ReceivePack extends BaseCommand {
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
    await this.recvObjects();
    await this.updateRefs();

    this.conn?.output.end();
    this.exit(0);
  }

  private async recvUpdateRequests() {
    checkConnected(this.conn);
    this.#requests = {};

    for await (const line of this.conn.recvUntil(null)) {
      if (line === null) unreachable("recvUntil(null) は null を yield しない");
      const [oldOid, newOid, ref] = line.split(/ +/);
      this.#requests[ref] = [oldOid, newOid].map(
        this.zeroToUndefined,
      ) as OldNewOidPair;
    }
  }

  private zeroToUndefined(oid: string) {
    return oid === remote_agent.ZERO_OID ? undefined : oid;
  }

  private async recvObjects() {
    try {
      this.#unpackError = undefined;
      const unpackLimit = await this.repo.config.get([
        "receive",
        "unpackLimit",
      ]);
      asserts(typeof unpackLimit === "number" || unpackLimit === undefined);
      if (Object.values(this.#requests).some(([, newOid]) => newOid)) {
        await receive_objects.receivePackedObjects(this, { unpackLimit });
      }
      this.reportStatus("unpack ok");
    } catch (e: unknown) {
      const err = e as Error;
      this.#unpackError = err;
      this.reportStatus(`unpack ${err.message}`);
    }
  }

  private async updateRefs() {
    for (const [ref, [oldOid, newOid]] of Object.entries(this.#requests)) {
      await this.updateRef(ref, oldOid, newOid);
    }
    this.reportStatus(null);
  }

  private async updateRef(
    ref: string,
    oldOid: OID | undefined,
    newOid: OID | undefined,
  ): Promise<void> {
    if (this.#unpackError) {
      this.reportStatus(`ng ${ref} unpacker error`);
      return;
    }

    try {
      await this.validateUpdate(ref, oldOid, newOid);
      await this.repo.refs.compareAndSwap(ref, oldOid, newOid);
      this.reportStatus(`ok ${ref}`);
    } catch (e: unknown) {
      asserts(e instanceof Error);
      this.reportStatus(`ng ${ref} ${e.message}`);
    }
  }

  private reportStatus(line: string | null): void {
    checkConnected(this.conn);
    if (this.conn.capable("report-status")) {
      this.conn.sendPacket(line);
    }
  }

  private async validateUpdate(
    ref: string,
    oldOid: OID | undefined,
    newOid: OID | undefined,
  ): Promise<void> {
    if (await this.repo.config.get(["receive", "denyDeletes"])) {
      if (newOid === undefined) {
        throw new BaseError("deletion prohibited");
      }
    }

    if (await this.repo.config.get(["receive", "denyNonFastForwards"])) {
      if (await fast_forward.fastForwardError(this, oldOid, newOid)) {
        throw new BaseError("non-fast-forward");
      }
    }

    const isBare = await this.repo.config.get(["core", "bare"]);
    const currentRef = (await this.repo.refs.currentRef()).path;
    if (!(isBare === false && currentRef === ref)) {
      return;
    }

    const denyCurrentBranch = await this.repo.config.get([
      "receive",
      "denyCurrentBranch",
    ]);
    if (!(denyCurrentBranch === false)) {
      if (newOid) {
        throw new BaseError("branch is currently checked out");
      }
    }

    const denyDeleteCurrent = await this.repo.config.get([
      "receive",
      "denyDeleteCurrent",
    ]);

    if (!(denyDeleteCurrent === false)) {
      if (newOid === undefined) {
        throw new BaseError("deletion of the current branch prohibited");
      }
    }
  }
}
