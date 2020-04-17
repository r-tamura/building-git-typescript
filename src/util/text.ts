/**
 * template literalのインデントを調整します。
 * 空行を除いた行の中で、インデント数が最小の行のインデント数分、全行からインデントを取り除きます。
 * https://2ality.com/2016/05/template-literal-whitespace.html
 * @param strings
 * @param args
 */
export function stripIndent(strings: TemplateStringsArray, ...args: any[]) {
  const strs = strings.map((s, i) => s + (args[i] ?? ""));
  const countIndent = (s: string) => s.match(/^\s*/)?.[0].length ?? 0;
  const tripIndent = (n: number) => (s: string) => s.slice(n);
  const lines = strs.join("").split("\n");
  const minIndent = lines
    .filter((s) => s.trim().length > 0)
    .reduce((min, line) => {
      return Math.min(min, countIndent(line));
    }, Number.MAX_SAFE_INTEGER);
  const trimedLines = lines.map(tripIndent(minIndent));
  return trimedLines.join("\n");
}
