import * as path from "path";
import { Config } from "../config";
import * as Refs from "../refs";
import { BaseError, isempty } from "../util";
import { Refspec } from "./refspec";
import { Remote } from "./remote";

export type RemoteName = string;

export class InvalidRemote extends BaseError {}
export class InvalidBranch extends BaseError {}

export const DEFAULT_REMOTE = "origin";

export class Remotes {
  #config: Config;
  constructor(config: Config) {
    this.#config = config;
  }

  async listRemotes() {
    await this.#config.open();
    return this.#config.subsections("remote");
  }

  async get(name: RemoteName): Promise<Remote | undefined> {
    await this.#config.open();
    if (!this.#config.section(["remote", name])) {
      return undefined;
    }
    return Remote.of(this.#config, name);
  }

  async add(name: RemoteName, url: string, branches: string[] = []) {
    if (isempty(branches)) {
      branches = ["*"];
    }

    await this.#config.openForUpdate();

    if (await this.#config.get(["remote", name, "url"])) {
      await this.#config.save();
      throw new InvalidRemote(`remote ${name} already exists.`);
    }

    this.#config.set(["remote", name, "url"], url);

    for (const branch of branches) {
      const source = path.join(Refs.HEADS_DIR, branch);
      const target = path.join(Refs.REMOTES_DIR, name, branch);
      const refspec = new Refspec(source, target, true);
      this.#config.add(["remote", name, "fetch"], refspec.toString());
    }

    await this.#config.save();
  }

  async remove(name: RemoteName) {
    await this.#config.openForUpdate();

    const success = this.#config.removeSection(["remote", name]);
    await this.#config.save();
    if (!success) {
      throw new InvalidRemote(`No such remote: ${name}`);
    }
  }

  async setUpstream(
    branch: string,
    upstream: string,
  ): Promise<[name: string, ref: string]> {
    const remotes = await this.listRemotes();

    for (const name of remotes) {
      const ref = await this.get(name).then((remote) =>
        remote?.setUpstream(branch, upstream),
      );
      if (ref) {
        return [name, ref];
      }
    }

    throw new InvalidBranch(
      `Cannot setup tracking information; starting point '${upstream}' is not a branch`,
    );
  }

  async unsetUpstream(branch: string): Promise<void> {
    await this.#config.openForUpdate();
    this.#config.unset(["branch", branch, "remote"]);
    this.#config.unset(["branch", branch, " merge"]);
    await this.#config.save();
  }

  async getUpstream(branch: string): Promise<string | undefined> {
    await this.#config.open();
    const name = (await this.#config.get([
      "branch",
      branch,
      "remote",
    ])) as string;
    return this.get(name).then((remote) => remote?.getUpstream(branch));
  }
}
