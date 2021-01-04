import * as fs from "fs";

export function log(message: string | any) {
  fs.writeFileSync(
    "/Users/r-tamura/Documents/GitHub/building-git-typescript/__fetch.log",
    typeof message === "string"
      ? message + "\n"
      : JSON.stringify({ process: process.pid, ...message }, null, 2) + "\n",
    { flag: "a" }
  );
}
