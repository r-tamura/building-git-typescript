import * as path from "path";
import { Remote } from "./remote";
import { Config } from "../config";
import * as Refs from "../refs";
import { BaseError, isempty } from "../util";
import { Refspec } from "./refspec";

export type RemoteName = string;

export class InvalidRemote extends BaseError {}

const DEFAULT_REMOTE = "origin";

export class Remotes {
  #config: Config;
  constructor(config: Config) {
    this.#config = config;
  }

  async listRemotes() {
    await this.#config.open();
    return this.#config.subsections("remote");
  }

  async get(name: RemoteName) {
    await this.#config.open();
    if (!this.#config.section(["remote", name])) {
      return null;
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
}
