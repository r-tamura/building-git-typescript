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

  async fetchUrl(): Promise<string | undefined> {
    const url = await this.#config.get(["remote", this.#name, "url"]);
    this.assertString(url);
    return url;
  }

  async pushUrl(): Promise<string | undefined> {
    const url =
      (await this.#config.get(["remote", this.#name, "pushurl"])) ??
      (await this.fetchUrl());
    this.assertString(url);
    return url;
  }

  async fetchSpecs(): Promise<(string | undefined)[]> {
    return (await this.#config.getAll(["remote", this.#name, "fetch"])) as (
      | string
      | undefined
    )[];
  }

  async uploader(): Promise<string | undefined> {
    const uploader = await this.#config.get([
      "remote",
      this.#name,
      "uploadpack",
    ]);
    this.assertString(uploader);
    return uploader;
  }

  private assertString(v: unknown): asserts v is string | undefined {
    if (v !== undefined && typeof v !== "string") {
      throw TypeError(`value '${v}'is not string`);
    }
  }
}
