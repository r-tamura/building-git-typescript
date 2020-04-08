import * as path from "path";
import {
  FileService,
  defaultFs,
  Process,
  defaultProcess,
  readTextStream
} from "./services";
import { Workspace } from "./workspace";
import { Blob } from "./blob";
import { Database } from "./database";
import { Entry } from "./entry";
import { Tree } from "./tree";
import { Author } from "./author";
import { Commit } from "./commit";

export type Environment = {
  process: Process;
  fs: FileService;
  date: {
    now(): Date;
  };
};

function createMain() {
  const env: Environment = {
    process: defaultProcess,
    fs: defaultFs,
    date: {
      now: () => new Date()
    }
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
        ["objects", "refs"].map(dir => {
          return env.fs
            .mkdir(path.join(gitPath, dir), { recursive: true })
            .catch((err: NodeJS.ErrnoException) => {
              console.log("%o", err);
              console.error(`fatal: ${err}`);
              process.exit(1);
            });
        })
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
      const database = new Database(dbPath);

      const paths = await workspace.listFiles();
      const entries = await Promise.all(
        paths.map(async p => {
          const data = await workspace.readFile(p);
          const blob = new Blob(data);
          await database.store(blob);
          return new Entry(p, blob.oid);
        })
      );

      const tree = new Tree(entries);
      await database.store(tree);

      const name = process.env["GIT_AUTHOR_NAME"];
      const email = process.env["GIT_AUTHOR_EMAIL"];

      const author = new Author(name, email, env.date.now());
      const message = await readTextStream(process.stdin);

      const commit = new Commit(tree.oid, author, message);
      database.store(commit);

      env.fs.writeFile(path.join(gitPath, "HEAD"), commit.oid);

      console.log(`[(root-commit) ${commit.oid}] ${message.split("\n")[0]}`);

      break;
    }
    default:
      console.error(`jit: '${command}' is not a jit command`);
      process.exit(1);
  }
}

if (require.main == module) {
  createMain()(process.argv.slice(2));
}
