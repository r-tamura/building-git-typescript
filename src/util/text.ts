
/**
 * 文字列の最初と最後にある空白文字を取り除いた文字列を返します
 * https://docs.ruby-lang.org/ja/latest/method/String/i/strip.html
 * @param str
 */
export function strip(str: string) {
  return str.replace(/^\s+/, "").replace(/\s+$/, "");
}

/**
 * 改行コード付きで行ごとに分割します
 * Rubyの string#lines 相当の関数
 * @param str
 */
export function splitByLine(str: string) {
  // sep = '\n'
  // [^\n]+\n? or \n
  // Reference: https://stackoverflow.com/questions/36464953/split-string-in-javascript-but-keep-delimiter/36465144#36465144
  return str.match(/[^\n]+\n?|\n/g) ?? [];
}

function minIndent(str: string) {
  const match = str.match(/^[ \t]*(?=\S)/gm);
  if (match === null) {
    return 0;
  }
  return Math.min(...match.map((chunk) => chunk.length));
}

/**
 * template literalのインデントを調整します。
 * 空行を除いた行の中で、インデント数が最小の行のインデント数分、全行からインデントを取り除きます。
 * 先頭行と最終行が空行の場合は、それらも取り除かれます。
 * https://2ality.com/2016/05/template-literal-whitespace.html
 * @param strings
 * @param args
 */
export function stripIndent(strings: TemplateStringsArray, ...args: any[]) {
  // EOLにWindowsの改行コードを含む場合はテストデータに誤りがあるのでエラーを投げる
  if (strings.join("").includes("\r")) {
    throw new Error("EOLにWindowsの改行コードを含む場合はテストデータに誤りがあります。");
  }
  const notIsEmptyFirstLastLine = (line: string, i: number, lines: string[]) =>
    !((i === 0 || i === lines.length - 1) && line.trim() === "");

  // テストデータはLFで改行さているため、LFで分割する
  const lines = strings
    .map((s, i) => s + (args[i] ?? ""))
    .join("")
    .split("\n")
    .filter(notIsEmptyFirstLastLine);
  const str = lines.join("\n");
  const min = minIndent(str);
  const indent = new RegExp(`^[ \\t]{${min}}`, "gm");
  return str.replace(indent, "");
}

export function toLF(str: string) {
  return str.replace(/\r\n/g, "\n");
}