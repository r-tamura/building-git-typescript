import * as arg from "arg";
import * as pack from "../pack";
import * as remotes from "../remotes";
import { SourceRef } from "../remotes";
import * as rev_list from "../rev_list";
import { OID } from "../types";
import { asserts, BaseError } from "../util";
import * as array from "../util/array";
import { Base } from "./base";
import * as fast_forward from "./shared/fast_forward";
import * as receive_objects from "./shared/receive_objects";
import * as remote_client from "./shared/remote_client";
import { checkConnected } from "./shared/remote_common";

interface Options {
  /**
   * refspecのforce設定
   * @default false
   */
  force: boolean;

  /**
   * Remote agentプログラム名
   */
  uploader?: string;
}

const UPLOAD_PACK = "git-upload-pack";

export class Fetch extends Base<Options> implements remote_client.RemoteClient {
  #fetchUrl?: string;
  #errors: Record<remotes.TargetRef, fast_forward.FastForwardError> = {};
  #uploader?: string;
  #fetchSpecs: string[] = [];

  /**
   * Remote Refに対するRefと強制フラグ
   *
   * @example
   * {
   *  "refs/remotes/origin/maint" => ["refs/heads/maint", true],
   *  "refs/remotes/origin/master" => ["refs/heads/master", true],
   *  "refs/remotes/origin/todo" => ["refs/heads/todo", true]
   * }
   */
  #targets: remotes.RefspecMappings = {};

  /**
   * @example
   * {
   *   "HEAD" => "5d826e972970a784bd7a7bdf587512510097b8c7",
   *   "refs/heads/maint" => "98cdfbb84ad2ed6a2eb43dafa357a70a4b0a0fad",
   *   "refs/heads/master" => "5d826e972970a784bd7a7bdf587512510097b8c7",
   *   "refs/heads/todo" => "b2cc3488ba006e3ba171e85dffbe6f332f84bf9a"
   * }
   */
  remoteRefs: Record<remotes.TargetRef, OID> = {};
  localRefs: Record<remotes.TargetRef, OID | undefined> = {};
  conn?: remotes.Protocol;
  async run(): Promise<void> {
    await this.configure();
    asserts(this.#uploader !== undefined);
    asserts(this.#fetchUrl !== undefined);

    remote_client.startAgent(this, {
      name: "fetch",
      program: this.#uploader,
      url: this.#fetchUrl,
    });
    await remote_client.recvReferences(this);
    await this.sendWantList();
    await this.sendHaveList();
    await this.recvObjects();
    this.conn?.output.end();
    await this.updateRemoteRefs();

    this.exit(array.isempty(Object.keys(this.#errors)) ? 0 : 1);
  }

  defineSpec(): arg.Spec {
    return {
      "--force": arg.flag(() => {
        this.options["force"] = true;
      }),
      "-f": "--force",
      "--upload-pack": (uploader: string) => {
        this.options["uploader"] = uploader;
      },
    };
  }

  initOptions(): void {
    this.options = {
      force: false,
    };
  }

  private async configure(): Promise<void> {
    const currentBranch = (await this.repo.refs.currentRef()).shortName();
    const buranchRemote = await this.repo.config.get([
      "branch",
      currentBranch,
      "remote",
    ]);

    const name = this.args[0] ?? buranchRemote ?? remotes.DEFAULT_REMOTE;
    const remote = await this.repo.remotes.get(name);

    if (remote === undefined) {
      throw new BaseError("couldn't find any remote in config");
    }

    this.#fetchUrl = (await remote?.fetchUrl()) ?? this.args[0];
    this.#uploader =
      this.options["uploader"] ?? (await remote?.uploader()) ?? UPLOAD_PACK;
    this.#fetchSpecs =
      this.args.length > 1
        ? array.drop(this.args, 1)
        : await remote.fetchSpecs();
  }

  private async sendWantList(): Promise<void> {
    asserts(this.remoteRefs !== undefined);
    checkConnected(this.conn);

    this.#targets = remotes.Refspec.expand(
      this.#fetchSpecs,
      Object.keys(this.remoteRefs),
    );
    const wanted = new Set<OID>();

    this.localRefs = {};

    for (const [target, [source, _]] of Object.entries(this.#targets)) {
      this.assertsSourceRef(source);

      const localOid = await this.repo.refs.readRef(target);

      const remoteOid = this.remoteRefs[source];
      if (localOid === remoteOid) {
        continue;
      }
      // null -> undefined変換
      this.localRefs[target] = localOid ?? undefined;
      wanted.add(remoteOid);
    }

    for (const oid of wanted) {
      this.conn.sendPacket(`want ${oid}`);
    }
    this.conn.sendPacket(null);

    if (wanted.size === 0) {
      this.exit(0);
    }
  }

  private async sendHaveList() {
    checkConnected(this.conn);
    const options = {
      all: true,
      missing: true,
    } as const;
    const revList = await rev_list.RevList.fromRevs(this.repo, [], options);
    for await (const commit of revList) {
      this.conn.sendPacket(`have ${commit.oid}`);
    }
    this.conn.sendPacket("done");

    await this.waitForObjects();
  }

  private async waitForObjects() {
    checkConnected(this.conn);
    for await (const _ of this.conn.recvUntil(pack.SIGNATURE));
  }

  private async recvObjects() {
    const unpackLimit = await this.repo.config.get(["receive", "unpackLimit"]);
    asserts(typeof unpackLimit === "number" || unpackLimit === undefined);
    await receive_objects.receivePackedObjects(this, {
      unpackLimit,
      prefix: pack.SIGNATURE,
    });
  }

  private async updateRemoteRefs() {
    this.logger.error(`From ${this.#fetchUrl}`);

    this.#errors = {};
    for (const [target, oid] of Object.entries(this.localRefs)) {
      await this.attemptRefUpdate(target, oid);
    }
  }

  private async attemptRefUpdate(
    target: remotes.TargetRef,
    oldOid: OID | undefined,
  ) {
    const [source, forced] = this.#targets[target];
    this.assertsSourceRef(source);

    const newOid = this.remoteRefs[source];
    const refNames = [source, target] as const;
    const ffError = await fast_forward.fastForwardError(this, oldOid, newOid);

    let error = undefined; // else節を通過しなければundefined
    if (this.options["force"] || forced || ffError === undefined) {
      await this.repo.refs.updateRef(target, newOid);
    } else {
      error = this.#errors[target] = ffError;
    }

    remote_client.reportRefUpdate(this, {
      refNames,
      error,
      oldOid,
      newOid,
      isFF: ffError === undefined,
    });
  }

  private assertsSourceRef(
    ref: SourceRef | undefined,
  ): asserts ref is SourceRef {
    asserts(
      ref !== undefined,
      "'source'が空文字となるのはpushコマンドでremoteブランチを削除する場合",
    );
  }
}
