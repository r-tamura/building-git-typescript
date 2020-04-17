import * as path from "path";
import { Runnable } from "./types";
import { asserts } from "../util";
import { Repository } from "../repository";
import * as Database from "../database";
import { readTextStream } from "../services";
import { Environment } from "../types";

export class Commit implements Runnable {
  constructor(private env: Environment) {}

  async run() {
    // Assumes the current working directory is the location of the repo.
    const rootPath = this.env.process.cwd();
    const repo = new Repository(path.join(rootPath, ".git"), this.env);

    await repo.index.load();
    const root = Database.Tree.build(repo.index.eachEntry());
    await root.traverse((tree) => repo.database.store(tree));
    asserts(root.oid !== null);

    const parent = await repo.refs.readHead();
    const name = this.env.process.env["GIT_AUTHOR_NAME"];
    const email = this.env.process.env["GIT_AUTHOR_EMAIL"];

    asserts(typeof name === "string");
    asserts(typeof email === "string");

    const author = new Database.Author(name, email, this.env.date.now());
    const message = await readTextStream(process.stdin);

    const commit = new Database.Commit(parent, root.oid, author, message);
    await repo.database.store(commit);

    asserts(commit.oid !== null);

    await repo.refs.updateHead(commit.oid);

    const isRoot = parent === null ? "(root-commit) " : "";
    console.log(`[${isRoot}${commit.oid}] ${message.split("\n")[0]}`);
  }
}
