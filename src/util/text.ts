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

/**
 * template literalのインデントを調整します。
 * 空行を除いた行の中で、インデント数が最小の行のインデント数分、全行からインデントを取り除きます。
 * 先頭行と最終行が空行の場合は、それらも取り除かれます。
 * https://2ality.com/2016/05/template-literal-whitespace.html
 * @param strings
 * @param args
 */
export function stripIndent(strings: TemplateStringsArray, ...args: any[]) {
  const strs = strings.map((s, i) => s + (args[i] ?? ""));
  const countIndent = (s: string) => s.match(/^\s*/)?.[0].length ?? 0;
  const tripIndent = (n: number) => (s: string) => s.slice(n);
  const filterEmptyLine = (i: number, lines: string[]) =>
    lines[i] !== "" ? lines : [...lines.slice(0, i), ...lines.slice(i + 1)];
  const lines = strs.join("").split("\n");
  const minIndent = lines
    .filter((s) => s.trim().length > 0)
    .reduce((min, line) => {
      return Math.min(min, countIndent(line));
    }, Number.MAX_SAFE_INTEGER);
  let trimedLines = lines.map(tripIndent(minIndent));
  trimedLines = filterEmptyLine(0, trimedLines);
  trimedLines = filterEmptyLine(trimedLines.length - 1, trimedLines);
  return trimedLines.join("\n");
}
