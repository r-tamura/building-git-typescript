import * as remotes from "../remotes/protocol";
import { Environment, OID } from "../types";
import { BaseError } from "../util";
import { Base } from "./base";
import * as remote_agent from "./shared/remote_agent";
import { checkConnected } from "./shared/remote_common";
import * as send_objects from "./shared/send_objects";

function log(message: string) {
  // require("fs").writeFileSync(
  //   `/Users/r-tamura/Documents/GitHub/building-git-typescript/__uploadpack.log`,
  //   message + "\n",
  //   {
  //     flag: "a",
  //   }
  // );
  console.warn({ remote: message });
}

export class UploadPack extends Base implements remote_agent.RemoteAgent {
  /** クライアントが必要としているRefセット */
  #wanted: Set<OID> = new Set();
  /** クライアントが所持しているコミットIDセット */
  #remoteHas: Set<OID> = new Set();

  stdin: NodeJS.Process["stdin"];
  conn?: remotes.Protocol;
  #env: Environment;

  constructor(args: string[], env: Environment) {
    super(args, env);
    this.#env = env;
    this.stdin = env.process?.stdin ?? process.stdin;
  }

  async run(): Promise<void> {
    remote_agent.acceptClient(this, { name: "upload-pack" });
    log("-- sendReferences --");
    await remote_agent.sendReferences(this, this.#env);
    log("-- wantlist --");
    await this.recvWantList();
    log("-- havelist --");
    await this.recvHaveList();
    log("-- send objects --");
    await this.sendObjects();
    log("-- exit --");
    this.exit(0);
  }

  private async recvWantList(): Promise<void> {
    this.#wanted = await this.recvOids("want", null);
    if (this.#wanted.size === 0) {
      this.exit(0);
    }
  }

  private async recvHaveList(): Promise<void> {
    checkConnected(this.conn);
    this.#remoteHas = await this.recvOids("have", "done");
    this.conn.sendPacket("NAK");
  }

  private async recvOids(
    prefix: string,
    terminator: string | null
  ): Promise<Set<OID>> {
    checkConnected(this.conn);
    // TODO: [0-9a-f]で正規表現がマッチしない
    const pattern = new RegExp(`^${prefix} ([0-9a-f]+)$`);
    const result = new Set<OID>();

    for await (const line of this.conn.recvUntil(terminator)) {
      if (line === null) {
        throw new BaseError("unexpected null");
      }
      const match = pattern.exec(line);
      if (match === null) {
        log("couldn't match");
        throw new BaseError("pattern should not be null");
      }
      result.add(match[1]);
    }
    return result;
  }

  private async sendObjects() {
    const revs = [
      ...this.#wanted,
      ...Array.from(this.#remoteHas).map((oid) => "^" + oid),
    ];
    await send_objects.sendPackedObjects(this, revs);
  }
}
