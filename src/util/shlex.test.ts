import { describe, expect, it } from "vitest";
import { quote, split } from "./shlex";

describe("shlex.split", () => {
  it("空文字列は空配列", () => {
    expect(split("")).toEqual([]);
  });

  it("単一トークン", () => {
    expect(split("vim")).toEqual(["vim"]);
  });

  it("空白で区切る", () => {
    expect(split("vim --foo bar")).toEqual(["vim", "--foo", "bar"]);
  });

  it("連続空白は単一区切りとして扱う", () => {
    expect(split("a   b\tc\nd")).toEqual(["a", "b", "c", "d"]);
  });

  it("先頭末尾の空白は無視", () => {
    expect(split("  hello  world  ")).toEqual(["hello", "world"]);
  });

  it("single quote 内は空白も literal", () => {
    expect(split("'hello world'")).toEqual(["hello world"]);
  });

  it("single quote 内はエスケープ無効", () => {
    expect(split(String.raw`'a\b'`)).toEqual([String.raw`a\b`]);
  });

  it('double quote 内は \\\\ と \\" のみ unescape', () => {
    expect(split(String.raw`"a\"b\\c"`)).toEqual([String.raw`a"b\c`]);
  });

  it("double quote 内のその他 \\X は literal", () => {
    expect(split(String.raw`"a\nb"`)).toEqual([String.raw`a\nb`]);
  });

  it("quote 外の \\X は次の 1 文字を literal 化", () => {
    expect(split(String.raw`a\ b\"c`)).toEqual([`a b"c`]);
  });

  it("quote と非 quote の混在", () => {
    expect(split(`code "--user-data" 'my dir'`)).toEqual([
      "code",
      "--user-data",
      "my dir",
    ]);
  });

  it("vim 単独", () => {
    expect(split("vim")).toEqual(["vim"]);
  });

  it("code --wait", () => {
    expect(split("code --wait")).toEqual(["code", "--wait"]);
  });

  it("git-upload-pack", () => {
    expect(split("git-upload-pack")).toEqual(["git-upload-pack"]);
  });

  it("ssh コマンドラインに近い形", () => {
    expect(split("ssh -p 22 user@host git-upload-pack")).toEqual([
      "ssh",
      "-p",
      "22",
      "user@host",
      "git-upload-pack",
    ]);
  });

  it("閉じない single quote は throw", () => {
    expect(() => split("'unterminated")).toThrow();
  });

  it("閉じない double quote は throw", () => {
    expect(() => split(`"unterminated`)).toThrow();
  });

  it("末尾 backslash は throw", () => {
    expect(() => split("trailing\\")).toThrow();
  });
});

describe("shlex.quote", () => {
  it("空文字列は ''", () => {
    expect(quote("")).toBe("''");
  });

  it("安全文字のみは無修飾", () => {
    expect(quote("hello")).toBe("hello");
    expect(quote("a-b_c.d")).toBe("a-b_c.d");
    expect(quote("path/to/file")).toBe("path/to/file");
    expect(quote("user@host")).toBe("user@host");
  });

  it("空白を含むなら single-quote で囲む", () => {
    expect(quote("hello world")).toBe("'hello world'");
  });

  it("特殊文字を含むなら single-quote で囲む", () => {
    expect(quote("a;b")).toBe("'a;b'");
    expect(quote("a$b")).toBe("'a$b'");
    expect(quote("a&b")).toBe("'a&b'");
  });

  it("内部の single quote は閉じ→ダブル囲み→開き でステッチ", () => {
    expect(quote("it's")).toBe(`'it'"'"'s'`);
  });

  it("split → quote 経由で round trip", () => {
    const args = ["ssh", "-p", "22", "user@host", "git upload-pack"];
    const joined = args.map(quote).join(" ");
    expect(split(joined)).toEqual(args);
  });
});
