import * as arg from "arg";
import * as remotes from "../remotes";
import { Revision } from "../revision";
import { OID } from "../types";
import { asserts, BaseError } from "../util";
import * as array from "../util/array";
import { nullify } from "../util/logic";
import * as objectUtil from "../util/object";
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
const UNPACK_LINE = /^unpack (.+)/;
const UPDATE_LINE = /^(ok|ng) (\S+)(.*)$/;

type PushError = [
  pair: remote_client.SouceTargetPair,
  message: fast_forward.FastForwardError
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

    // Note: 子プロセスのstdinへの入力の終了を明示的に伝えないと、子プロセスがハングする
    this.conn?.output.end();

    this.printSummary();
    await this.recvReportStatus();

    this.exit(array.isempty(this.#errors) ? 0 : 1);
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
    checkConnected(this.conn);
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

    for (const [ref, [, , oldOid, newOid]] of Object.entries(this.#updates)) {
      this.sendUpdate(ref, oldOid, newOid);
    }
    this.conn?.sendPacket(null);
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
    } else {
      this.#errors.push([[source, target], ffError]);
    }
  }

  private selectDeletion(target: remotes.TargetRef): void {
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

  private printSummary() {
    if (objectUtil.isempty(this.#updates) && array.isempty(this.#errors)) {
      this.logger.error("Everything up-to-date");
    } else {
      this.logger.error(`To ${this.#pushUrl}`);

      for (const [refNames, error] of this.#errors) {
        remote_client.reportRefUpdate(this, { refNames, error });
      }
    }
  }

  private async recvReportStatus(): Promise<void> {
    checkConnected(this.conn);
    if (
      !this.conn.capable("report-status") ||
      objectUtil.isempty(this.#updates)
    ) {
      return;
    }
    const packet = await this.conn.recvPacket();
    if (packet === null) {
      throw new BaseError("this packet should not be null");
    }
    const unpackResult = UNPACK_LINE.exec(packet)?.[1];
    if (unpackResult === undefined) {
      throw new BaseError("couldn't unpack result");
    }

    if (unpackResult !== "ok") {
      this.logger.error(`error: remote unpack failed: ${unpackResult}`);
    }

    for await (const line of this.conn.recvUntil(null)) {
      await this.handleStatus(line);
    }
  }

  private async handleStatus(line: string | null): Promise<void> {
    let match;
    if (line === null || !(match = UPDATE_LINE.exec(line))) {
      return;
    }

    const [, status, ref] = match;
    const error = status === "ok" ? undefined : match[3].trim();

    if (error) {
      // Note: rubyソースだと@errors.push([ref, error]) if error
      // ここでのrefはtargetなので、[undefined, ref]が正しい?
      this.#errors.push([[undefined, ref], error]);
    }
    this.reportUpdate(ref, error);

    const targets = remotes.Refspec.expand(this.#fetchSpecs, [ref]);

    for (const [localRef, [remoteRef]] of Object.entries(targets)) {
      if (remoteRef === undefined) {
        continue;
      }
      const newOid = array.last(this.#updates[remoteRef]);
      if (!error) {
        await this.repo.refs.updateRef(localRef, nullify(newOid));
      }
    }
  }

  private reportUpdate(
    target: remotes.TargetRef,
    error: string | undefined
  ): void {
    const [source, ffError, oldOid, newOid] = this.#updates[target];
    const refNames = [source, target] as const;
    remote_client.reportRefUpdate(this, {
      refNames,
      error,
      oldOid,
      newOid,
      isFF: ffError === undefined,
    });
  }
}
