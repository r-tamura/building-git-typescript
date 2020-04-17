import * as path from "path";
import { Runnable } from "./types";
import { Environment } from "../types";

export class Init implements Runnable {
  constructor(private env: Environment) {}

  async run(...argv: string[]) {
    const [repositoryDirName = this.env.process.cwd()] = argv;
    const rootPath = path.resolve(repositoryDirName);
    const gitPath = path.join(rootPath, ".git");
    await Promise.all(
      ["objects", "refs"].map((dir) =>
        this.env.fs
          .mkdir(path.join(gitPath, dir), { recursive: true })
          .catch((err: NodeJS.ErrnoException) => {
            console.log("%o", err);
            console.error(`fatal: ${err}`);
            process.exit(1);
          })
      )
    );

    console.log(`Initialized empty Jit repository in ${gitPath}`);
  }
}
