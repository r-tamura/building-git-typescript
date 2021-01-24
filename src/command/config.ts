import * as arg from "arg";
import * as ConfigLib from "../config";
import { SectionName } from "../config";
import { Pathname } from "../types";
import { asserts, compact, isempty } from "../util";
import { Base } from "./base";

interface Options {
  /** ファイル環境名かファイルパス */
  file?: ConfigLib.ConfigName | Pathname;
  add?: string;
  replace?: string;
  get_all?: string;
  unset?: string;
  unset_all?: string;
  remove_section?: string;
}
export class Config extends Base<Options> {
  async run() {
    if (this.options["add"]) {
      await this.addVariable(this.options["add"]);
    }
    if (this.options["replace"]) {
      await this.replaceVariable(this.options["replace"]);
    }
    if (this.options["get_all"]) {
      await this.getAllValues(this.options["get_all"]);
    }
    if (this.options["unset"]) {
      await this.unsetSingle(this.options["unset"]);
    }
    if (this.options["unset_all"]) {
      await this.unsetAll(this.options["unset_all"]);
    }
    if (this.options["remove_section"]) {
      await this.removeSection(this.options["remove_section"]);
    }

    const key = this.parseKey(this.args[0]);
    const value = this.args[1];

    try {
      if (value) {
        await this.editConfig((config) => config.set(key, value));
      } else {
        await this.readConfig((config) =>
          config.get(key).then((value) => compact([value])),
        );
      }
    } catch (e) {
      if (e instanceof ConfigLib.ParseError) {
        this.logger.error(`error: ${e.message}`);
        this.exit(3);
      }
    }
  }

  defineSpec() {
    return {
      "--local": arg.flag(() => {
        this.options["file"] = "local";
      }),
      "--global": arg.flag(() => {
        this.options["file"] = "global";
      }),
      "--system": arg.flag(() => {
        this.options["file"] = "system";
      }),
      "--file": (value: Pathname) => {
        this.options["file"] = value;
      },
      "--add": (name: string) => {
        this.options["add"] = name;
      },
      "--replace-all": (name: string) => {
        this.options["replace"] = name;
      },
      "--get-all": (name: string) => {
        this.options["get_all"] = name;
      },
      "--unset": (name: string) => {
        this.options["unset"] = name;
      },
      "--unset-all": (name: string) => {
        this.options["unset_all"] = name;
      },
      "--remove-section": (name: string) => {
        this.options["remove_section"] = name;
      },
    };
  }

  initOptions() {
    this.options = {};
  }

  private async addVariable(keyFromArgs: string) {
    const key = this.parseKey(keyFromArgs);
    await this.editConfig((config) => config.add(key, this.args[0]));
  }

  private async replaceVariable(keyFromArgs: string) {
    const key = this.parseKey(keyFromArgs);
    return await this.editConfig((config) =>
      config.replaceAll(key, this.args[0]),
    );
  }

  private async unsetSingle(keyFromArgs: string) {
    const key = this.parseKey(keyFromArgs);
    return await this.editConfig((config) => config.unset(key));
  }

  private async unsetAll(keyFromArgs: string) {
    const key = this.parseKey(keyFromArgs);
    return await this.editConfig((config) => config.unsetAll(key));
  }

  private async removeSection(keyFromArgs: string) {
    const key = keyFromArgs.split(".", 2) as SectionName;
    return await this.editConfig((config) => config.removeSection(key));
  }

  private async getAllValues(keyFromArgs: string) {
    const key = this.parseKey(keyFromArgs);
    return await this.readConfig((config) => config.getAll(key));
  }

  private async readConfig(
    callback: (
      config: ConfigLib.Stack | ConfigLib.Config,
    ) => ReturnType<ConfigLib.Config["getAll"]>,
  ) {
    let config: ConfigLib.Stack | ConfigLib.Config = this.repo.config;
    if (this.options["file"]) {
      config = config.file(this.options["file"]);
    }

    await config.open();
    const values = await callback(config);
    if (isempty(values)) {
      this.exit(1);
    }

    values.forEach((value) => {
      this.log(value?.toString() ?? "");
    });
    this.exit(0);
  }

  private async editConfig(
    callback: (config: ConfigLib.Config) => void,
  ): Promise<never> {
    const config = this.repo.config.file(this.options["file"] ?? "local");

    try {
      await config.openForUpdate();
      callback(config);
      await config.save();

      this.exit(0);
    } catch (e) {
      if (e instanceof ConfigLib.Conflict) {
        this.logger.error(`error: ${e.message}`);
        await config.rollback();
        this.exit(5);
      }
      throw e;
    }
  }

  private parseKey(name: string) {
    const nameComponents = name.split(".");
    const section = nameComponents.shift();
    const varname = nameComponents.pop();
    const subsection = nameComponents;

    asserts(section !== undefined);

    if (!varname) {
      this.logger.error(`error: key does not contain a section: ${name}`);
      this.exit(2);
    }

    if (!ConfigLib.validKey([section, varname])) {
      this.logger.error(`error: invalid key: ${name}`);
      this.exit(1);
    }

    if (isempty(subsection)) {
      return [section, varname] as ConfigLib.SectionName;
    } else {
      return [section, subsection.join("."), varname] as ConfigLib.SectionName;
    }
  }
}
