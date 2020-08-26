import * as path from "path";
import { Pathname } from "../types";
import { includes, last } from "../util/array";
import { Config, SectionName } from "./config";

// Note: NodeJSではビルトインで'~'を解決する方法は提供されていない
// https://stackoverflow.com/questions/21077670/expanding-resolving-in-node-js
const GLOBAL_CONFIG = path.resolve(`${process.env["HOME"]}/.gitconfig`);
const SYSTEM_CONFIG = "/etc/gitconfig";

export const CONFIG_NAMES = ["local", "global", "system"] as const;
export type ConfigName = typeof CONFIG_NAMES[number];
export type Configs = Record<ConfigName, Config>;

type Values = ReturnType<Config["getAll"]> extends Promise<infer R> ? R : never;

export class Stack {
  #configs: Configs;
  constructor(gitPath: Pathname) {
    this.#configs = {
      local: new Config(path.join(gitPath, "config")),
      global: new Config(GLOBAL_CONFIG),
      system: new Config(SYSTEM_CONFIG),
    };
  }

  async open() {
    await Promise.all(Object.values(this.#configs).map((config) => config.open()));
  }

  async get(key: SectionName) {
    return this.getAll(key).then(last);
  }

  async getAll(key: SectionName) {
    const names: ConfigName[] = ["system", "global", "local"];
    const result: Values = [];
    for (const name of names) {
      await this.#configs[name].open();
      result.push(...(await this.#configs[name].getAll(key)));
    }
    return result;
  }

  file(configPath: Pathname): Config;
  file(name: ConfigName): Config;
  file(nameOrPath: string) {
    if (includes(nameOrPath, CONFIG_NAMES)) {
      // config name
      return this.#configs[nameOrPath];
    } else {
      // file path
      return new Config(nameOrPath);
    }
  }
}
