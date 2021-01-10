import * as arg from "arg";
import * as remotes from "../remotes";
import { Revision } from "../revision";
import { OID } from "../types";
import { asserts } from "../util";
import * as array from "../util/array";
import { Base } from "./base";
import * as fast_forward from "./shared/fast_forward";
import * as remote_client from "./shared/remote_client";
import { checkConnected } from "./shared/remote_common";
import * as send_objects from "./shared/send_objects";

interface Options {
  /** non fast-forwardの更新の場合もrefを更新する */
  force: boolean;
  /** git commandb */
  receiver?: string;
}

const RECEIVE_PACK = "git-receive-pack";
const CAPABILITIES = ["report-status"];

type PushError = [
  y: [x: undefined, target: remotes.TargetRef],
  message: string
];

type Update = [
  source: remotes.SourceRef | undefined,
  ffError: fast_forward.FastForwardError | undefined,
  old: OID,
  new: OID | undefined
];

export class Push extends Base<Options> {
  #pushUrl?: string;
  #fetchSpecs: string[] = [];
  #receiver?: string;
  #pushSpecs: string[] = [];
  conn?: remotes.Protocol;
  remoteRefs: Record<remotes.TargetRef, OID> = {};

  #updates: Record<string, Update> = {};
  #errors: PushError[] = [];
  async run(): Promise<void> {
    await this.configure();
    asserts(this.#receiver !== undefined);
    asserts(this.#pushUrl !== undefined);

    remote_client.startAgent(this, {
      name: "push",
      program: this.#receiver,
      url: this.#pushUrl,
      capabilities: CAPABILITIES,
    });

    await remote_client.recvReferences(this);
    await this.sendUpdateRequests();
    await this.sendObjects();

    this.exit(0);
  }

  defineSpec(): arg.Spec {
    return {
      "--force": arg.flag(() => {
        this.options["force"] = true;
      }),
      "-f": "--force",
      "--receive-pack": (receiver: string) => {
        this.options["receiver"] = receiver;
      },
    };
  }

  initOptions(): void {
    this.options = {
      force: false,
    };
  }

  private async configure(): Promise<void> {
    const name = this.args[0] ?? remotes.DEFAULT_REMOTE;
    const remote = await this.repo.remotes.get(name);

    this.#pushUrl = (await remote?.pushUrl()) ?? this.args[0];
    this.#fetchSpecs = (await remote?.fetchSpecs()) ?? [];
    this.#receiver =
      this.options["receiver"] ?? (await remote?.receiver()) ?? RECEIVE_PACK;
    this.#pushSpecs =
      this.args.length > 1
        ? array.drop(this.args, 1)
        : (await remote?.pushSpecs()) ?? [];
  }

  private async sendUpdateRequests() {
    this.#updates = {};
    this.#errors = [];

    const localRefs = await this.repo.refs
      .listAllRefs()
      .then((refs) => refs.map((ref) => ref.path))
      .then((paths) => paths.sort());
    const targets = remotes.Refspec.expand(this.#pushSpecs, localRefs);

    for (const [target, [source, forced]] of Object.entries(targets)) {
      await this.selectUpdate(target, source, forced);
    }
  }

  private async selectUpdate(
    target: remotes.TargetRef,
    source: remotes.SourceRef | undefined,
    forced: boolean
  ): Promise<void> {
    if (source === undefined) {
      this.selectDeletion(target);
      return;
    }

    const oldOid = this.remoteRefs[target];
    const newOid = await new Revision(this.repo, source).resolve();

    if (oldOid === newOid) {
      return;
    }

    const ffError = await fast_forward.fastForwardError(this, oldOid, newOid);

    if (this.options["force"] || forced || ffError === undefined) {
      this.#updates[target] = [source, ffError, oldOid, newOid];
    }

    for (const [ref, [_, __, oldOid, newOid]] of Object.entries(
      this.#updates
    )) {
      this.sendUpdate(ref, oldOid, newOid);
    }
    this.conn?.sendPacket(null);
  }

  private selectDeletion(target: remotes.TargetRef) {
    checkConnected(this.conn);
    if (this.conn.capable("delete-refs")) {
      this.#updates[target] = [
        undefined,
        undefined,
        this.remoteRefs[target],
        undefined,
      ];
    } else {
      this.#errors.push([
        [undefined, target],
        "remote does not support deleting refs",
      ]);
    }
  }

  private sendUpdate(
    ref: string,
    oldOid: OID | undefined,
    newOid: OID | undefined
  ): void {
    checkConnected(this.conn);
    const _oldOid = this.undefinedToZero(oldOid);
    const _newOid = this.undefinedToZero(newOid);

    this.conn.sendPacket(`${_oldOid} ${_newOid} ${ref}`);
  }

  private undefinedToZero(oid: OID | undefined): OID {
    return oid === undefined ? remote_client.ZERO_OID : oid;
  }

  private async sendObjects() {
    const revs = array.compact(
      Object.values(this.#updates).map((update) => update[3])
    );
    if (array.isempty(revs)) {
      return;
    }

    revs.push(...Object.values(this.remoteRefs).map((oid) => `^${oid}`));

    await send_objects.sendPackedObjects(this, revs);
  }
}
