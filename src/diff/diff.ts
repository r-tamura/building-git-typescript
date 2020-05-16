import { Myers } from "./myers";
import { splitByLine } from "../util";

export type TextDocument = string | string[];

export class Line {
  constructor(public number: number, public text: string) {}

  static of(number: number, text: string) {
    return new Line(number, text);
  }
}

export function lines(document: TextDocument) {
  const _document =
    typeof document === "string" ? splitByLine(document) : document;
  return _document.map((line, i) => Line.of(i + 1, line));
}

export function diff(a: TextDocument, b: TextDocument) {
  return Myers.diff(lines(a), lines(b));
}
