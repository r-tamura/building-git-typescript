import { Config } from "../config";
import { RemoteName } from "./remotes";

export class Remote {
  #config: Config;
  #name: RemoteName;

  static async of(config: Config, name: RemoteName) {
    const self = new this(config, name);
    await self.#config.open();
    return self;
  }

  private constructor(config: Config, name: RemoteName) {
    this.#config = config;
    this.#name = name;
  }

  async fetchUrl() {
    return this.#config.get(["remote", this.#name, "url"]);
  }

  async pushUrl() {
    return (await this.#config.get(["remote", this.#name, "pushurl"])) ?? (await this.fetchUrl());
  }

  async fetchSpecs() {
    return this.#config.getAll(["remote", this.#name, "fetch"]);
  }

  async uploader() {
    return this.#config.getAll(["remote", this.#name, "uploadpack"]);
  }
}
