import { Stats, Dirent } from "fs";

export const makeTestStats = (
  props: Partial<Omit<Stats, keyof Dirent>> = {}
): Stats => {
  const defaultProps = {
    dev: 16777221,
    mode: 33188,
    nlink: 1,
    uid: 501,
    gid: 20,
    rdev: 0,
    blksize: 4096,
    ino: 8641819819,
    size: 240,
    blocks: 8,
    atimeMs: 1586430703479.845,
    mtimeMs: 1586430700957.3962,
    ctimeMs: 1586430701957.3962,
    birthtimeMs: 1586310405936.23,
    atime: new Date("2020-04-09T11:11:43.480Z"),
    mtime: new Date("2020-04-09T11:11:41.957Z"),
    ctime: new Date("2020-04-09T11:11:41.957Z"),
    birthtime: new Date("2020-04-08T01:46:45.936Z"),
  };
  const stats = new Stats();
  return { ...stats, ...defaultProps, ...props };
};
