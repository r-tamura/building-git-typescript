import { Myers } from "./myers";

export type TextDocument = string | string[];

export function lines(document: TextDocument) {
  return typeof document === "string"
    ? document.split("\n").map((line) => line + "\n")
    : document;
}

export function diff(a: TextDocument, b: TextDocument) {
  return Myers.diff(lines(a), lines(b));
}
