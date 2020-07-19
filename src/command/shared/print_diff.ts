import * as path from "path";
import { Hunk, diffHunks, HunkEdit, combinedHunk, TextDocument } from "../../diff";
import { OID, Pathname } from "../../types";
import { Base } from "../base";
import arg = require("arg");
import { prop } from "../../util/object";

export const NULL_OID = "0".repeat(40);
export const NULL_PATH = "/dev/null";

interface PrintDiffOption {
  patch: boolean;
}

interface DefinedPrintDiffOptionReponse {
  "--patch": arg.Handler;
  "-p": "--patch";
  "-u": "--patch";
  "--no-patch": arg.Handler;
  "-s": "--no-patch";
}
export function definePrintDiffOptions<T extends PrintDiffOption>(
  cmd: Base<T>
): DefinedPrintDiffOptionReponse {
  return {
    "--patch": arg.flag(() => {
      cmd.options.patch = true;
    }),
    "-p": "--patch",
    "-u": "--patch",
    "--no-patch": arg.flag(() => {
      cmd.options.patch = false;
    }),
    "-s": "--no-patch",
  };
}

export function header(text: string, cmd: Base) {
  cmd.log(cmd.fmt("bold", text));
}

export function printDiff(a: Target, b: Target, cmd: Base) {
  if (a.equals(b)) {
    return;
  }

  a.name = path.join("a", a.name);
  b.name = path.join("b", b.name);

  cmd.log(`diff --git ${a.name} ${b.name}`);
  printMode(a, b, cmd);
  printDiffContent(a, b, cmd);
}

export function printMode(a: Target, b: Target, cmd: Base) {
  if (a.mode === null) {
    header(`new file mode ${b.mode}`, cmd);
  } else if (b.mode === null) {
    header(`deleted file mode ${a.mode}`, cmd);
  } else if (a.mode !== b.mode) {
    header(`old mode ${a.mode}`, cmd);
    header(`new mode ${b.mode}`, cmd);
  }
}

export function printDiffContent(a: Target, b: Target, cmd: Base) {
  if (a.equalsContent(b)) {
    return;
  }

  let oidRange = `index ${short(a.oid, cmd)}..${short(b.oid, cmd)}`;
  if (a.mode === b.mode) {
    oidRange += ` ${a.mode}`;
  }
  cmd.log(oidRange);
  cmd.log(`--- ${a.deffPath}`);
  cmd.log(`+++ ${b.deffPath}`);

  const hunks = diffHunks(a.data, b.data);
  for (const hunk of hunks) {
    printDiffHunk(hunk, cmd);
  }
}

export function printDiffEdit(edit: HunkEdit, cmd: Base) {
  const text = edit.toString();
  switch (edit.type) {
    case "eql":
      cmd.log(text);
      break;
    case "ins":
      cmd.log(cmd.fmt("green", text));
      break;
    case "del":
      cmd.log(cmd.fmt("red", text));
      break;
    default:
      throw TypeError(`diff: invalid type '${edit.type}'`);
  }
}

export function printCombinedDiff(as: [Target, Target], b: Target, cmd: Base) {
  header(`diff --cc ${b.name}`, cmd);

  const a_oids = as.map((a) => short(a.oid, cmd));
  const oidRange = `index ${a_oids.join(",")}..${short(b.oid, cmd)}`;
  header(oidRange, cmd);

  if (!as.every((a) => a.mode === b.mode)) {
    header(`mode ${as.map(prop("mode")).join(",")}..${b.mode}`, cmd);
  }

  header(`--- a/${b.deffPath}`, cmd);
  header(`+++ b/${b.deffPath}`, cmd);

  const hunks = combinedHunk(as.map(prop("data")) as [TextDocument, TextDocument], b.data);
  hunks.forEach((hunk) => {
    printDiffHunk(hunk, cmd);
  });
}

export function printDiffHunk(hunk: Hunk, cmd: Base) {
  cmd.log(cmd.fmt("cyan", hunk.header()));
  hunk.edits.forEach((e) => {
    printDiffEdit(e, cmd);
  });
}

export function short(oid: OID, cmd: Base) {
  return cmd.repo.database.shortOid(oid);
}

export class Target {
  constructor(
    public name: Pathname,
    public oid: OID,
    public mode: string | null,
    public data: string
  ) {}

  static of(name: Pathname, oid: OID, mode: string | null, data: string) {
    return new this(name, oid, mode, data);
  }

  get deffPath() {
    return this.mode ? this.name : NULL_PATH;
  }

  equals(b: Target) {
    return this.oid === b.oid && this.mode === b.mode;
  }

  equalsContent(b: Target) {
    return this.oid === b.oid;
  }
}
