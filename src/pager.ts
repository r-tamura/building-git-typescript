import { spawn } from "child_process";
import { Process } from "./services";

const PAGER_CMD = "less";
// less, lvコマンドに対応
const PAGER_ENV = { LESS: "FRX", LV: "-c" } as const;
export class Pager {
  input!: NodeJS.Process["stdout"];

  constructor(
    public envvars: Process["env"],
    public stdout: Process["stdout"],
    public stderr: Process["stderr"]
  ) {}

  static of(
    envvars: Process["env"],
    stdout: Process["stdout"],
    stderr: Process["stderr"]
  ) {
    const pager = new this(envvars, stdout, stderr);
    const env: NodeJS.ProcessEnv = { ...PAGER_ENV, ...envvars };
    const cmd = env["GIT_PAGER"] ?? env["PAGER"] ?? PAGER_CMD;

    const child = spawn(cmd, {
      env,
      stdio: ["pipe", stdout, stderr],
    });

    pager.input = child.stdin as Process["stdout"];

    return pager;
  }
}
