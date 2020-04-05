import { promisify } from "util";
import * as fs from "fs";

export const mkdir = promisify(fs.mkdir);
export const readdir = promisify(fs.readdir);

export type FileService = {
  mkdir: typeof mkdir;
  readdir: typeof readdir;
};

export const defaultFs: FileService = {
  mkdir,
  readdir
};
