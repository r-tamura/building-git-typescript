import * as path from "path";
import { Environment } from "../types";
import { Base } from "./base";

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
    await Promise.all(
      ["objects", "refs"].map((dir) =>
        this.env.fs
          .mkdir(path.join(gitPath, dir), { recursive: true })
          .catch((err: NodeJS.ErrnoException) => {
            logger.error(`fatal: ${err}`);
            this.exit(1);
          })
      )
    );

    this.log(`Initialized empty Jit repository in ${gitPath}`);
  }
}
