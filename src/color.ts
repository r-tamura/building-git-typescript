// SRG: Select Graphic Rendition
const SRG_CODES = {
  bold: 1,
  red: 31,
  green: 32,
  yellow: 33,
  cyan: 36,
} as const;

export type Style = keyof typeof SRG_CODES;

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
  // ';' がエスケープシーケンス引数の区切り文字
  return `\x1b[${codes.join(";")}m${text}\x1b[m`;
}
