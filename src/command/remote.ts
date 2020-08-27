import arg = require("arg");
import { InvalidRemote, RemoteName } from "../remotes";
import { asserts } from "../util";
import { Base } from "./base";

interface Options {
  verbose: boolean;
  tracked: string[];
}

export class Remote extends Base<Options> {
  async run() {
    const subcommand = this.args.shift();

    switch (subcommand) {
      case "add":
        await this.addRemote();
        break;
      case "remove":
        await this.remoteRemote();
        break;
      default:
        await this.listRemotes();
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

  private async listRemotes() {
    const names = await this.repo.remotes.listRemotes();
    for (const name of names) {
      await this.listRemote(name);
    }
  }

  private async listRemote(name: RemoteName) {
    if (!this.options["verbose"]) {
      this.log(name);
      return;
    }

    const remote = await this.repo.remotes.get(name);
    asserts(remote !== null, "存在するリモートの中から選ばれる");
    this.log(`${name}\t${await remote.fetchUrl()} (fetch)`);
    this.log(`${name}\t${await remote.pushUrl()} (push)`);
  }

  private async addRemote() {
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

  private async remoteRemote() {
    try {
      await this.repo.remotes.remove(this.args[0]);
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
