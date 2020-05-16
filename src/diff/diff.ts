import { Myers } from "./myers";

export type TextDocument = string | string[];

export class Line {
  constructor(public number: number, public text: string) {}

  static of(number: number, text: string) {
    return new Line(number, text);
  }
}

function splitByLine(target: string) {
  // Rubyの string#lines 相当の関数 改行文字付きで行を分割する
  // sep = '\n'
  // [^\n]+\n? or \n
  // Reference: https://stackoverflow.com/questions/36464953/split-string-in-javascript-but-keep-delimiter/36465144#36465144
  return target.match(/[^\n]+\n?|\n/g) ?? [];
}

export function lines(document: TextDocument) {
  const _document =
    typeof document === "string" ? splitByLine(document) : document;
  return _document.map((line, i) => Line.of(i + 1, line));
}

export function diff(a: TextDocument, b: TextDocument) {
  return Myers.diff(lines(a), lines(b));
}
