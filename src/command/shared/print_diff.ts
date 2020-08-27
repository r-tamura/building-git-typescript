import { assertsString, SectionName } from "../../config";
import { assertsStyle } from "../../color";

const DIFF_FORMATS = {
  context: "normal",
  meta: "bold",
  frag: "cyan",
  old: "red",
  new: "green",
} as const;

export async function header(text: string, cmd: Base) {
  cmd.log(await diffFmt("meta", text, cmd));
export async function printDiff(a: Target, b: Target, cmd: Base) {
  await printMode(a, b, cmd);
  await printDiffContent(a, b, cmd);
export async function printMode(a: Target, b: Target, cmd: Base) {
    await header(`new file mode ${b.mode}`, cmd);
    await header(`deleted file mode ${a.mode}`, cmd);
    await header(`old mode ${a.mode}`, cmd);
    await header(`new mode ${b.mode}`, cmd);
export async function printDiffContent(a: Target, b: Target, cmd: Base) {
    await printDiffHunk(hunk, cmd);
export async function printDiffEdit(edit: HunkEdit, cmd: Base) {
      cmd.log(await diffFmt("context", text, cmd));
      cmd.log(await diffFmt("new", text, cmd));
      cmd.log(await diffFmt("old", text, cmd));
export async function printCombinedDiff(as: [Target, Target], b: Target, cmd: Base) {
  await header(`diff --cc ${b.name}`, cmd);
  await header(oidRange, cmd);
    await header(`mode ${as.map(prop("mode")).join(",")}..${b.mode}`, cmd);
  await header(`--- a/${b.deffPath}`, cmd);
  await header(`+++ b/${b.deffPath}`, cmd);
  for (const hunk of hunks) {
    await printDiffHunk(hunk, cmd);
  }
export async function printDiffHunk(hunk: Hunk, cmd: Base) {
  cmd.log(await diffFmt("frag", hunk.header(), cmd));
  for (const edit of hunk.edits) {
    await printDiffEdit(edit, cmd);
  }
export async function diffFmt(name: keyof typeof DIFF_FORMATS, text: string, cmd: Base) {
  const key = ["color", "diff", name] as SectionName;
  const value = await cmd.repo.config.get(key);
  assertsString(value);
  const style = value?.split(/ +/) ?? [DIFF_FORMATS[name]];
  assertsStyle(style);
  return cmd.fmt(style, text);
}
