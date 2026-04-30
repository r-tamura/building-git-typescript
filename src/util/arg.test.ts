import { describe, expect, it } from "vitest";
import arg from "./arg";

describe("arg shim", () => {
  it("位置引数を _ に集める", () => {
    const result = arg({}, { argv: ["foo", "bar"] });
    expect(result._).toEqual(["foo", "bar"]);
  });

  it("arg.flag は値を取らずハンドラを呼ぶ", () => {
    let called = 0;
    const result = arg(
      {
        "--verbose": arg.flag(() => {
          called += 1;
        }),
      },
      { argv: ["--verbose"] },
    );
    expect(called).toBe(1);
    expect(result._).toEqual([]);
  });

  it("値ハンドラは次の argv を受け取る", () => {
    let received: string | undefined;
    arg(
      {
        "--message": (value: string) => {
          received = value;
        },
      },
      { argv: ["--message", "hello"] },
    );
    expect(received).toBe("hello");
  });

  it("--key=value 形式に対応する", () => {
    let received: string | undefined;
    arg(
      {
        "--message": (value: string) => {
          received = value;
        },
      },
      { argv: ["--message=hello"] },
    );
    expect(received).toBe("hello");
  });

  it("短名→長名エイリアス", () => {
    let called = 0;
    arg(
      {
        "--force": arg.flag(() => {
          called += 1;
        }),
        "-f": "--force",
      },
      { argv: ["-f"] },
    );
    expect(called).toBe(1);
  });

  it("短名→長名エイリアス (値あり)", () => {
    let received: string | undefined;
    arg(
      {
        "--message": (value: string) => {
          received = value;
        },
        "-m": "--message",
      },
      { argv: ["-m", "hello"] },
    );
    expect(received).toBe("hello");
  });

  it("長名→長名エイリアス", () => {
    const seen: string[] = [];
    arg(
      {
        "--pretty": (value: string) => {
          seen.push(value);
        },
        "--format": "--pretty",
      },
      { argv: ["--format", "oneline"] },
    );
    expect(seen).toEqual(["oneline"]);
  });

  it("同名フラグの繰り返しでハンドラが複数回呼ばれる", () => {
    let count = 0;
    arg(
      {
        "--verbose": arg.flag(() => {
          count += 1;
        }),
        "-v": "--verbose",
      },
      { argv: ["-v", "-v", "-v"] },
    );
    expect(count).toBe(3);
  });

  it("値ハンドラの繰り返し (配列 push 用途)", () => {
    const tracked: string[] = [];
    arg(
      {
        "-t": (value: string) => {
          tracked.push(value);
        },
      },
      { argv: ["-t", "main", "-t", "develop"] },
    );
    expect(tracked).toEqual(["main", "develop"]);
  });

  it("単独短名ハンドラ (-D)", () => {
    let called = 0;
    arg(
      {
        "-D": arg.flag(() => {
          called += 1;
        }),
      },
      { argv: ["-D"] },
    );
    expect(called).toBe(1);
  });

  it("オプションと位置引数の混在", () => {
    let force = false;
    const result = arg(
      {
        "--force": arg.flag(() => {
          force = true;
        }),
      },
      { argv: ["foo.txt", "--force", "bar.txt"] },
    );
    expect(force).toBe(true);
    expect(result._).toEqual(["foo.txt", "bar.txt"]);
  });

  it("数字短名 (-1, -2, -3)", () => {
    const seen: string[] = [];
    arg(
      {
        "--base": arg.flag(() => {
          seen.push("base");
        }),
        "--ours": arg.flag(() => {
          seen.push("ours");
        }),
        "--theirs": arg.flag(() => {
          seen.push("theirs");
        }),
        "-1": "--base",
        "-2": "--ours",
        "-3": "--theirs",
      },
      { argv: ["-2"] },
    );
    expect(seen).toEqual(["ours"]);
  });

  it("--no-foo は別エントリとして扱う", () => {
    const seen: string[] = [];
    arg(
      {
        "--decorate": (value: string) => {
          seen.push(`decorate:${value}`);
        },
        "--no-decorate": arg.flag(() => {
          seen.push("no-decorate");
        }),
      },
      { argv: ["--no-decorate"] },
    );
    expect(seen).toEqual(["no-decorate"]);
  });

  it("ハンドラ呼び出しは argv 順序を保つ", () => {
    const order: string[] = [];
    arg(
      {
        "--a": arg.flag(() => order.push("a")),
        "--b": arg.flag(() => order.push("b")),
        "--c": arg.flag(() => order.push("c")),
      },
      { argv: ["--c", "--a", "--b"] },
    );
    expect(order).toEqual(["c", "a", "b"]);
  });
});
