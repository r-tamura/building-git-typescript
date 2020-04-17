import * as path from "path";
import {
  FileService,
  Process,
  readTextStream,
  defaultProcess,
  defaultFs,
} from "./services";
import { Workspace, MissingFile } from "./workspace";
import { Blob } from "./database/blob";
import { Database, Author, Commit, Tree } from "./database";
import { Refs, LockDenied } from "./refs";
import { asserts, stripIndent } from "./util";
import { Index } from "./gindex";
import { NoPermission } from "./workspace";

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

      try {
        await index.loadForUpdate();
      } catch (e) {
        if (e instanceof LockDenied) {
          console.error(stripIndent`
          fatal: ${e.message}

          Another jit process seems to be running in this repository.
          Please make sure all processes are terminated then try again.
          If it still fails, a jit process may have crached in this
          repository earlier: remove the file manually to continue.
          `);
        } else {
          console.error(e.stack);
        }
        process.exit(128);
        return; // TODO: jestで終了の方法を調べる
      }

      let pathnameslist: string[][] | null = null;
      try {
        pathnameslist = await Promise.all(
          entryPaths.map((entryPath) => {
            const absPath = path.resolve(entryPath);
            return workspace.listFiles(absPath);
          })
        );
      } catch (e) {
        if (e instanceof MissingFile) {
          console.error(`fatal: ${e.message}`);
        } else {
          console.error(e.stack);
        }
        await index.releaseLock();
        process.exit(128);
        return; // TODO: jestで終了の方法を調べる
      }
      asserts(pathnameslist !== null);

      const pathnames = pathnameslist.flat();

      for (const pathname of pathnames) {
        try {
          const data = await workspace.readFile(pathname);
          const stat = await workspace.statFile(pathname);

          const blob = new Blob(data);
          await database.store(blob);
          asserts(typeof blob.oid === "string");
          index.add(pathname, blob.oid, stat);
        } catch (e) {
          if (e instanceof NoPermission) {
            console.error(`error: ${e.message}`);
            console.error(`fatal: adding files failed`);
          } else {
            console.error(e.stack);
          }
          index.releaseLock();
          process.exit(128);
          return; // TODO: jestで終了の方法を調べる
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
