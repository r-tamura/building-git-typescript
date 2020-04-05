import * as path from "path";
import { promisify } from "util";
import { FileService, defaultFs } from "./services/FileService";
import { WorkSpace } from "./workspace";

type Environment = {
  process: {
    getcwd: () => string;
  };
  fs: FileService;
};

const defaultProcess = {
  getcwd: process.cwd
};

function createMain() {
  const env: Environment = {
    process: defaultProcess,
    fs: defaultFs
  };

  return (argv: string[]) => {
    main(argv, env);
  };
}

export async function main(argv: string[], env: Environment) {
  const [command, repositoryDirName = env.process.getcwd()] = argv;
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
      const rootPath = env.process.getcwd();
      const gitPath = path.join(rootPath, ".git");
      const dbPath = path.join(gitPath, "objects");

      const workspace = new WorkSpace(rootPath, env);
      console.log(await workspace.listFiles());

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
