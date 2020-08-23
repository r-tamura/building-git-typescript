import { asserts } from "./util";
import { enumerate, includes } from "./util/array";

// SRG: Select Graphic Rendition
// https://notes.burke.libbey.me/ansi-escape-codes/
const SRG_CODES = {
  normal: 0,
  bold: 1,
  dim: 2,
  italic: 3,
  ul: 4,
  reverse: 7,
  strike: 9,
  // フォアグランドのベーシックカラーコード
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
} as const;

export type Style = keyof typeof SRG_CODES;

export function assertsStyle(cand: string): asserts cand is Style;
export function assertsStyle(cand: string[]): asserts cand is Style[];
export function assertsStyle(candidates: string | string[]): asserts candidates is Style | Style[] {
  coerce(candidates).map((cand) => asserts(includes(cand, Object.keys(SRG_CODES))));
}

// Ruby coerce to array [*x] 相当
function coerce<T>(x: T | T[]) {
  return Array.isArray(x) ? x : [x];
}

/**
 * ターミナル上での装飾用のコマンドをテキストへ付加します
 * @param style SGR名 or SGR名リスト
 * @param text 制御シーケンス付きテキスト
 */
export function format(style: Style | Style[], text: string) {
  const codes = coerce(style).map((name) => SRG_CODES[name]);

  let color = false;
  // - 色が二つ指定された場合、1つ目はフォアグラウンド、二つ目はバックグラウンドに利用される
  // - フォアグラウンド色のコードは30から始まる
  // - バックグラウンド色のコードは40から始まる
  // -> フォアグランドで色が指定されたたら、フラグ(color)を立て、バックグラウンドの色は+10する
  for (const [code, i] of enumerate(codes)) {
    if (code < 30) {
      continue;
    }
    if (color) {
      codes[i] += 10;
    }
    color = true;
  }

  // ';' がエスケープシーケンス引数の区切り文字
  return `\x1b[${codes.join(";")}m${text}\x1b[m`;
}
