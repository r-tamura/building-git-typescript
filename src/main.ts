import * as path from "path";
import {
  FileService,
  Process,
  readTextStream,
  defaultProcess,
  defaultFs,
} from "./services";
import { Workspace } from "./workspace";
import { Blob } from "./database/blob";
import { Database, Author, Commit, Tree } from "./database";
import { Entry } from "./entry";
import { Refs } from "./refs";
import { assert } from "./util";

export type Environment = {
  process: Process;
  fs: FileService;
  date: {
    now(): Date;
  };
};

export function createMain() {
  const env: Environment = {
    process: defaultProcess,
    fs: defaultFs,
    date: {
      now: () => new Date(),
    },
  };

  return (argv: string[]) => {
    main(argv, env);
  };
}

export async function main(argv: string[], env: Environment) {
  const [command, repositoryDirName = env.process.cwd()] = argv;
  switch (command) {
    case "init": {
      const rootPath = path.resolve(repositoryDirName);
      const gitPath = path.join(rootPath, ".git");
      Promise.all(
        ["objects", "refs"].map((dir) =>
          env.fs
            .mkdir(path.join(gitPath, dir), { recursive: true })
            .catch((err: NodeJS.ErrnoException) => {
              console.log("%o", err);
              console.error(`fatal: ${err}`);
              process.exit(1);
            })
        )
      );

      console.log(`Initialized empty Jit repository in ${gitPath}`);
      break;
    }
    case "commit": {
      // Assumes the current working directory is the location of the repo.
      const rootPath = env.process.cwd();
      const gitPath = path.join(rootPath, ".git");
      const dbPath = path.join(gitPath, "objects");

      const workspace = new Workspace(rootPath, env);
      const database = new Database(dbPath, env);
      const refs = new Refs(gitPath, env);

      const paths = await workspace.listFiles();
      const entries = await Promise.all(
        paths.map(async (p) => {
          const data = await workspace.readFile(p);
          const blob = new Blob(data);
          await database.store(blob);
          if (!blob.oid) {
            throw TypeError("blob.oid is not set.");
          }
          const stats = await workspace.statFile(p);
          return new Entry(p, blob.oid, stats);
        })
      );

      const root = Tree.build(entries);
      await root.traverse((tree) => database.store(tree));
      assert(root.oid !== null);

      const parent = await refs.readHead();
      const name = env.process.env["GIT_AUTHOR_NAME"];
      const email = env.process.env["GIT_AUTHOR_EMAIL"];

      assert(typeof name === "string");
      assert(typeof email === "string");

      const author = new Author(name, email, env.date.now());
      const message = await readTextStream(process.stdin);

      const commit = new Commit(parent, root.oid, author, message);
      await database.store(commit);

      assert(commit.oid !== null);

      await refs.updateHead(commit.oid);

      const isRoot = parent === null ? "(root-commit) " : "";
      console.log(`[${isRoot}${commit.oid}] ${message.split("\n")[0]}`);

      break;
    }
    default:
      console.error(`jit: '${command}' is not a jit command`);
      process.exit(1);
  }
}
