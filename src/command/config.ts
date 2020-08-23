import { Pathname } from "../types";
import { Base } from "./base";

type FileType = "local" | "global" | "system";
interface Options {
  /** ファイル環境名かファイルパス */
  file?: FileType | Pathname;
  add?: string;
  replace?: string;
  get_all?: string;
  unset?: string;
  unset_all?: string;
}
export class Config extends Base<Options> {
  async run() {}

  initOptions() {
    this.options = {};
  }
}
