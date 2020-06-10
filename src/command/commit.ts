import { Base } from "./base";
import { readTextStream } from "../services";
import { Environment } from "../types";
import { writeCommit } from "./shared/write_commit";

export class Commit extends Base {
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    const { process } = this.env;
    await this.repo.index.load();

    const parent = await this.repo.refs.readHead();
    const message = await readTextStream(process.stdin);
    const commit = await writeCommit(parent ? [parent] : [], message, this);
    const isRoot = parent === null ? "(root-commit) " : "";
    this.log(`[${isRoot}${commit.oid}] ${message.split("\n")[0]}`);
  }
}
