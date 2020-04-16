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
import { Refs } from "./refs";
import { asserts } from "./util";
import { Index } from "./gindex";

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
  const command = argv.shift();
  switch (command) {
    case "init": {
      const [repositoryDirName = env.process.cwd()] = argv;
      const rootPath = path.resolve(repositoryDirName);
      const gitPath = path.join(rootPath, ".git");
      await Promise.all(
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

      const database = new Database(dbPath, env);
      const index = new Index(path.join(gitPath, "index"), env);
      const refs = new Refs(gitPath, env);

      await index.load();
      const root = Tree.build(index.eachEntry());
      await root.traverse((tree) => database.store(tree));
      asserts(root.oid !== null);

      const parent = await refs.readHead();
      const name = env.process.env["GIT_AUTHOR_NAME"];
      const email = env.process.env["GIT_AUTHOR_EMAIL"];

      asserts(typeof name === "string");
      asserts(typeof email === "string");

      const author = new Author(name, email, env.date.now());
      const message = await readTextStream(process.stdin);

      const commit = new Commit(parent, root.oid, author, message);
      await database.store(commit);

      asserts(commit.oid !== null);

      await refs.updateHead(commit.oid);

      const isRoot = parent === null ? "(root-commit) " : "";
      console.log(`[${isRoot}${commit.oid}] ${message.split("\n")[0]}`);

      break;
    }

    case "add": {
      const entryPaths = argv;
      const rootPath = env.process.cwd();
      const gitPath = path.join(rootPath, ".git");

      const workspace = new Workspace(rootPath);
      const database = new Database(path.join(gitPath, "objects"));
      const index = new Index(path.join(gitPath, "index"));

      await index.loadForUpdate();

      for (const entryPath of entryPaths) {
        const absPath = path.resolve(entryPath);

        const pathnames = await workspace.listFiles(absPath);
        for (const pathname of pathnames) {
          const data = await workspace.readFile(pathname);
          const stat = await workspace.statFile(pathname);

          const blob = new Blob(data);
          await database.store(blob);
          asserts(typeof blob.oid === "string");
          index.add(pathname, blob.oid, stat);
        }
      }

      await index.writeUpdates();
      break;
    }
    default:
      console.error(`jit: '${command}' is not a jit command`);
      process.exit(1);
  }
}
