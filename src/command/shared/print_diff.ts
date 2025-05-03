import * as path from "path";
import { assertsStyle } from "../../color";
import { assertsString, SectionName } from "../../config";
import {
    combinedHunk,
    diffHunks,
    Hunk,
    HunkEdit,
    TextDocument,
} from "../../diff";
import { OID, Pathname } from "../../types";
import { prop } from "../../util/object";
import { BaseCommand } from "../base";
import arg = require("arg");

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

const DIFF_FORMATS = {
  context: "normal",
  meta: "bold",
  frag: "cyan",
  old: "red",
  new: "green",
} as const;

export function definePrintDiffOptions<T extends PrintDiffOption>(
  cmd: BaseCommand<T>,
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

export async function header(text: string, cmd: BaseCommand) {
  cmd.log(await diffFmt("meta", text, cmd));
}

export async function printDiff(a: Target, b: Target, cmd: BaseCommand) {
  if (a.equals(b)) {
    return;
  }

  a.name = path.join("a", a.name);
  b.name = path.join("b", b.name);

  cmd.log(`diff --git ${a.name} ${b.name}`);
  await printMode(a, b, cmd);
  await printDiffContent(a, b, cmd);
}

export async function printMode(a: Target, b: Target, cmd: BaseCommand) {
  if (a.mode === null) {
    await header(`new file mode ${b.mode}`, cmd);
  } else if (b.mode === null) {
    await header(`deleted file mode ${a.mode}`, cmd);
  } else if (a.mode !== b.mode) {
    await header(`old mode ${a.mode}`, cmd);
    await header(`new mode ${b.mode}`, cmd);
  }
}

export async function printDiffContent(a: Target, b: Target, cmd: BaseCommand) {
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
    await printDiffHunk(hunk, cmd);
  }
}

export async function printDiffEdit(edit: HunkEdit, cmd: BaseCommand) {
  const text = edit.toString();
  switch (edit.type) {
    case "eql":
      cmd.log(await diffFmt("context", text, cmd));
      break;
    case "ins":
      cmd.log(await diffFmt("new", text, cmd));
      break;
    case "del":
      cmd.log(await diffFmt("old", text, cmd));
      break;
    default:
      throw TypeError(`diff: invalid type '${edit.type}'`);
  }
}

export async function printCombinedDiff(
  as: [Target, Target],
  b: Target,
  cmd: BaseCommand,
) {
  await header(`diff --cc ${b.name}`, cmd);

  const a_oids = as.map((a) => short(a.oid, cmd));
  const oidRange = `index ${a_oids.join(",")}..${short(b.oid, cmd)}`;
  await header(oidRange, cmd);

  if (!as.every((a) => a.mode === b.mode)) {
    await header(`mode ${as.map(prop("mode")).join(",")}..${b.mode}`, cmd);
  }

  await header(`--- a/${b.deffPath}`, cmd);
  await header(`+++ b/${b.deffPath}`, cmd);

  const hunks = combinedHunk(
    as.map(prop("data")) as [TextDocument, TextDocument],
    b.data,
  );
  for (const hunk of hunks) {
    await printDiffHunk(hunk, cmd);
  }
}

export async function printDiffHunk(hunk: Hunk, cmd: BaseCommand) {
  cmd.log(await diffFmt("frag", hunk.header(), cmd));
  for (const edit of hunk.edits) {
    await printDiffEdit(edit, cmd);
  }
}

export function short(oid: OID, cmd: BaseCommand) {
  return cmd.repo.database.shortOid(oid);
}

export async function diffFmt(
  name: keyof typeof DIFF_FORMATS,
  text: string,
  cmd: BaseCommand,
) {
  const key = ["color", "diff", name] as SectionName;
  const value = await cmd.repo.config.get(key);
  assertsString(value);
  const style = value?.split(/ +/) ?? [DIFF_FORMATS[name]];
  assertsStyle(style);
  return cmd.fmt(style, text);
}

export class Target {
  constructor(
    public name: Pathname,
    public oid: OID,
    public mode: string | null,
    public data: string,
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
