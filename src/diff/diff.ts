import { Myers } from "./myers";
import { Hunk } from "./hunk";
import { splitByLine } from "../util";
import { Combined } from "./combined";
import { Edit } from "./myers";

export type TextDocument = string | string[];

export class Line {
  constructor(public number: number, public text: string) {}

  static of(number: number, text: string) {
    return new Line(number, text);
  }
}

export function diffHunks(a: TextDocument, b: TextDocument) {
  return Hunk.filter(diff(a, b));
}

export function lines(document: TextDocument) {
  const _document = typeof document === "string" ? splitByLine(document) : document;
  return _document.map((line, i) => Line.of(i + 1, line));
}

export function diff(a: TextDocument, b: TextDocument) {
  return Myers.diff(lines(a), lines(b));
}

/**
 *
 * @param as
 * @param b
 */
export function combined(as: [TextDocument, TextDocument], b: TextDocument) {
  const diffs = as.map((a) => diff(a, b)) as [Edit[], Edit[]];
  return new Combined(diffs).toArray();
}
