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

  async fetchUrl(): Promise<string> {
    const url = await this.#config.get(["remote", this.#name, "url"]);
    this.assertString(url);
    return url;
  }

  async pushUrl(): Promise<string> {
    const url =
      (await this.#config.get(["remote", this.#name, "pushurl"])) ??
      (await this.fetchUrl());
    this.assertString(url);
    return url;
  }

  async receiver(): Promise<string> {
    return (await this.#config.get([
      "remote",
      this.#name,
      "receivepack",
    ])) as string;
  }

  async fetchSpecs(): Promise<string[]> {
    return (await this.#config.getAll([
      "remote",
      this.#name,
      "fetch",
    ])) as string[];
  }

  async pushSpecs(): Promise<string[]> {
    return (await this.#config.getAll([
      "remote",
      this.#name,
      "push",
    ])) as string[];
  }

  async uploader(): Promise<string> {
    const uploader = await this.#config.get([
      "remote",
      this.#name,
      "uploadpack",
    ]);
    this.assertString(uploader);
    return uploader;
  }

  private assertString(v: unknown): asserts v is string {
    if (v !== undefined && typeof v !== "string") {
      throw TypeError(`value '${v}'is not string`);
    }
  }
}
