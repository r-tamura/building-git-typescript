import * as arg from "arg";
import * as remotes from "../remotes";
import * as array from "../util/array";
import { Base } from "./base";

interface Options {
  /**
   * refspecのforce設定
   * @default false
   */
  force: boolean;

  /**
   * Remote agentプログラム名
   */
  uploader?: string;
}

const UPLOAD_PACK = "git-upload-pack";

export class Fetch extends Base<Options> {
  #fetchUrl?: string;
  #errors: string[] = [];
  #uploader?: string;
  #fetchSpecs?: (string | undefined)[];
  async run(): Promise<void> {
    await this.configure();

    this.exit(array.isempty(this.#errors) ? 0 : 1);
  }

  defineSpec(): arg.Spec {
    return {
      "--force": arg.flag(() => {
        this.options["force"] = true;
      }),
      "-f": "--force",
      "--upload-pack": String,
    };
  }

  initOptions(): Options {
    return {
      force: false,
    };
  }

  private async configure() {
    const name = this.args[0] ?? remotes.DEFAULT_REMOTE;
    const remote = await this.repo.remotes.get(name);

    this.#fetchUrl = (await remote?.fetchUrl()) ?? this.args[0];
    this.#uploader =
      this.options["uploader"] ?? (await remote?.uploader()) ?? UPLOAD_PACK;
    this.#fetchSpecs =
      this.args.length > 1
        ? array.drop(this.args, 1)
        : await remote?.fetchSpecs();
  }
}
