import { Stats } from "fs";

export function isExecutable(stat: Stats) {
  const modeBin = stat.mode.toString(2);
  const user = modeBin.slice(7, 10);
  const isExecutable = 0b001 & Number.parseInt(user, 2);
  return isExecutable === 1;
}
