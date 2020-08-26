import arg = require("arg");
import { InvalidRemote } from "../remotes";
import { asserts } from "../util";
import { Base } from "./base";

interface Options {
  verbose: boolean;
  tracked: string[];
}

export class Remote extends Base<Options> {
  async run() {
    const subcommand = this.args.shift();
    asserts(subcommand !== undefined);

    switch (subcommand) {
      case "add":
        await this.addRemote();
        break;
      case "remove":
        break;
      default:
        break;
    }
  }

  defineSpec() {
    return {
      "--verbose": arg.flag(() => {
        this.options["verbose"] = true;
      }),
      "-v": "--verbose",
      "-t": (branch: string) => {
        this.options["tracked"].push(branch);
      },
    };
  }

  initOptions() {
    this.options = {
      verbose: false,
      tracked: [],
    };
  }

  async addRemote() {
    const [name, url] = this.args;
    try {
      await this.repo.remotes.add(name, url, this.options["tracked"]);
      this.exit(0);
    } catch (e: unknown) {
      if (e instanceof InvalidRemote) {
        this.logger.error(`fatal: ${e.message}`);
        this.exit(128);
      }
      throw e;
    }
  }
}
