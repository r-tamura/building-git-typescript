/**
 * POSIX shell の word splitting / quoting の最小実装。
 *
 * kit がオリジナル shlex パッケージに依存していた箇所 (editor / remote-client) で
 * 必要な範囲だけをカバーする。ANSI-C quote (`$'...'`) や localized quote (`$"..."`)、
 * 数値・hex・octal の escape sequence (`\n` / `\x41` / `ÿ`) は意図的に未対応。
 */

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

/**
 * `vim --foo "bar baz"` のような shell 風の文字列を引数列に分解する。
 *
 * 対応しているクォート:
 * - single quote (`'...'`) — 内部にエスケープ無し、literal 取り込み
 * - double quote (`"..."`) — `\\` と `\"` のみ unescape、それ以外の `\X` は literal
 * - quote 外の `\X` — 次の 1 文字を literal 化 (`\` 自身は脱落)
 *
 * 開いた quote のまま EOF に達した場合は throw。
 */
export function split(input: string): string[] {
  const tokens: string[] = [];
  let token: string | undefined;
  let i = 0;

  const pushChar = (c: string): void => {
    token = (token ?? "") + c;
  };

  while (i < input.length) {
    const c = input[i];

    if (WHITESPACE.has(c)) {
      if (token !== undefined) {
        tokens.push(token);
        token = undefined;
      }
      i++;
      continue;
    }

    if (c === "\\") {
      // quote 外のエスケープ: 次の 1 文字を literal 取り込み
      if (i + 1 >= input.length) {
        throw new Error("shlex.split: trailing backslash");
      }
      pushChar(input[i + 1]);
      i += 2;
      continue;
    }

    if (c === "'") {
      // single quote: 終端 ' まで literal、エスケープ無効
      const end = input.indexOf("'", i + 1);
      if (end === -1) {
        throw new Error("shlex.split: unclosed single quote");
      }
      token = (token ?? "") + input.slice(i + 1, end);
      i = end + 1;
      continue;
    }

    if (c === '"') {
      // double quote: \\ と \" のみ unescape
      i++;
      let buf = "";
      while (i < input.length && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < input.length) {
          const next = input[i + 1];
          if (next === "\\" || next === '"') {
            buf += next;
            i += 2;
            continue;
          }
        }
        buf += input[i];
        i++;
      }
      if (i >= input.length) {
        throw new Error("shlex.split: unclosed double quote");
      }
      token = (token ?? "") + buf;
      i++; // skip closing "
      continue;
    }

    pushChar(c);
    i++;
  }

  if (token !== undefined) {
    tokens.push(token);
  }
  return tokens;
}

/**
 * shell に渡しても安全な形にエスケープする。
 *
 * - 安全文字 (`[\w@%\-+=:,./]`) のみで構成される非空文字列はそのまま返す
 * - 空文字列は `''`
 * - それ以外は single-quote で囲み、内部の `'` は `'"'"'` (シングル閉じ→ダブル囲みのシングル→シングル開き) で接続
 */
export function quote(s: string): string {
  if (s === "") return "''";
  if (!/[^\w@%\-+=:,./]/.test(s)) return s;
  return ("'" + s.replace(/('+)/g, "'\"$1\"'") + "'").replace(/^''|''$/g, "");
}
