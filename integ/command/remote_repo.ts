import * as path from "path";
import { TestUtil } from "./helper";

export class RemoteRepo extends TestUtil {
  constructor(name: string) {
    super(name);
  }

  get repoPath(): string {
    return path.resolve(
      __dirname,
      "..",
      `test-repo-${this.name}`
      // path.basename(__filename)
    );
  }
}
