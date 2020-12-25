import * as remotes from "../remotes/protocol";
import { Nullable } from "../types";
import { Base } from "./base";

export class UploadPack extends Base {
  conn: Nullable<remotes.Protocol> = null;
  async run(): Promise<void> {
    this.exit(0);
  }
}
