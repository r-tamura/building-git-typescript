import * as path from "path";
import { Base } from "./base";
import { asserts } from "../util";
import { Repository } from "../repository";
import * as Database from "../database";
import { readTextStream } from "../services";
import { Environment } from "../types";

export class Commit extends Base {
  constructor(args: string[], env: Environment) {
    super(args, env);
  }

  async run() {
    const { date, process } = this.env;
    const rootPath = this.dir;
    const repo = new Repository(path.join(rootPath, ".git"), this.env);

    await repo.index.load();
    const root = Database.Tree.build(repo.index.eachEntry());
    await root.traverse((tree) => repo.database.store(tree));
    asserts(root.oid !== null);

    const parent = await repo.refs.readHead();
    const name = this.envvars["GIT_AUTHOR_NAME"];
    const email = this.envvars["GIT_AUTHOR_EMAIL"];

    // prettier-ignore
    asserts(typeof name === "string", "Environment variable 'GIT_AUTHOR_NAME' is not set.");
    // prettier-ignore
    asserts(typeof email === "string", "Environment variable 'GIT_AUTHOR_EMAIL' is not set.");

    const author = new Database.Author(name, email, date.now());
    const message = await readTextStream(process.stdin);

    const commit = new Database.Commit(parent, root.oid, author, message);
    await repo.database.store(commit);

    asserts(commit.oid !== null);

    await repo.refs.updateHead(commit.oid);

    const isRoot = parent === null ? "(root-commit) " : "";
    this.log(`[${isRoot}${commit.oid}] ${message.split("\n")[0]}`);
  }
}
