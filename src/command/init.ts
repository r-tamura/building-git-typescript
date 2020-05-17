import * as path from "path";
import { Environment } from "../types";
import { Refs } from "../refs";
import { Base } from "./base";

const DEFAULT_BRANCH = "master";
export class Init extends Base {
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    // jit init [directory]
    const { logger } = this.env;
    const directory = this.args[0] ?? this.dir;
    const rootPath = this.expeandedPathname(directory);

    const gitPath = path.join(rootPath, ".git");
    const creations = ["objects", path.join("refs", "heads")].map((dir) =>
      this.env.fs
        .mkdir(path.join(gitPath, dir), { recursive: true })
        .catch((err: NodeJS.ErrnoException) => {
          logger.error(`fatal: ${err}`);
          this.exit(1);
        })
    );
    await Promise.all(creations);

    const refs = new Refs(gitPath);
    const headPath = path.join("refs", "heads", DEFAULT_BRANCH);
    await refs.updateHead(`ref: ${headPath}`);

    this.log(`Initialized empty Jit repository in ${gitPath}`);
  }
}
