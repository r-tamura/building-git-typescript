import * as arg from "arg";
import * as pack from "../pack";
import * as remotes from "../remotes";
import * as rev_list from "../rev_list";
import { OID } from "../types";
import { asserts, BaseError } from "../util";
import * as array from "../util/array";
import { Base } from "./base";
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
  #errors: string[] = [];
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
  localRefs: Record<remotes.TargetRef, OID> = {};
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

    await this.sendWantList();
    await this.sendHaveList();

    this.exit(array.isempty(this.#errors) ? 0 : 1);
  }

  defineSpec(): arg.Spec {
    return {
      "--force": arg.flag(() => {
        this.options["force"] = true;
      }),
      "-f": "--force",
      "--upload-pack": String,
    };
  }

  initOptions(): Options {
    return {
      force: false,
    };
  }

  private async configure(): Promise<void> {
    const name = this.args[0] ?? remotes.DEFAULT_REMOTE;
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
    remotes.Refspec.expand(this.#fetchSpecs, Object.keys(this.remoteRefs));
    const wanted = new Set<string>();

    this.localRefs = {};

    for (const [target, [source, _]] of Object.entries(this.#targets)) {
      const localOid = await this.repo.refs.readRef(target);
      if (localOid === null) {
        throw new BaseError("couldn't find the specified ref");
      }

      const remoteOid = this.remoteRefs[source];

      if (localOid === remoteOid) {
        continue;
      }

      this.localRefs[target] = localOid;
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
}
