import { Config } from "../config";
import { Refs } from "../refs";
import { FileService } from "../services";
import { Environment } from "../types";
import { posixJoin, PosixPath, posixPath, toOsPath } from "../util/fs";
import { BaseCommand } from "./base";

const DEFAULT_BRANCH = "master";

const mkdirRec = async (fs: FileService, dirPath: PosixPath) => {
  try {
    await fs.mkdir(toOsPath(dirPath), { recursive: true });
  } catch (err) {
    throw new Error(`fatal: ${err}`);
  }
}
export class InitCommand extends BaseCommand {
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    const workTreeRootDir = this.args[0] ?? this.workDir;
    const workTreeRootPath = this.expandPathnameOs(workTreeRootDir);

    const gitPath = posixJoin(workTreeRootPath, ".git");

    const dirCreationPromises = [
      mkdirRec(this.env.fs, posixJoin(gitPath, "objects")),
      mkdirRec(this.env.fs, posixJoin(gitPath, "refs", "heads")),
    ]
    await Promise.all(dirCreationPromises)
      .catch((err: unknown) => {
        this.env.logger.error("fatal: could not initiate git repository");
        this.env.logger.error(`fatal: ${err}`);
        this.exit(1);
      });

    // PosixPathで渡す
    const config = new Config(posixPath(posixJoin(gitPath, "config")));
    await config.openForUpdate();
    config.set(["core", "bare"], false);
    await config.save();

    const refs = new Refs(gitPath);
    const symRef = posixJoin("refs", "heads", DEFAULT_BRANCH);
    await refs.setHeadSymRef(symRef);

    this.log(`Initialized empty Jit repository in ${gitPath}`);
  }
}
