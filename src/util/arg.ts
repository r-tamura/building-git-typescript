import { parseArgs, type ParseArgsConfig } from "node:util";

const flagSymbol = Symbol("arg flag");

export type Handler<T = any> = (
  value: any,
  name: string,
  previousValue?: T,
) => T;

export interface Spec {
  [key: string]: string | Handler;
}

export interface Options {
  argv?: string[];
}

export type Result<T extends Spec> = { _: string[] } & {
  [K in keyof T]?: T[K] extends Handler ? ReturnType<T[K]> : never;
};

// ────────────────────────────────────────────────
// 内部用ドメイン型 (実体は string、識別子のラベル付け用)
// ────────────────────────────────────────────────

/** spec オブジェクトのキー文字列 ("--foo" / "-x") */
type SpecKey = string;
/** parseArgs に渡す option 名 ("foo" / "x"。先頭ダッシュ無し) */
type ParseArgsName = string;

type ParseArgsOption = NonNullable<ParseArgsConfig["options"]>[string];

/** SpecKey をパースした構造表現 */
type ParsedSpecKey =
  | { kind: "long"; name: ParseArgsName }
  | { kind: "short"; name: ParseArgsName };

interface HandlerEntry {
  fn: Handler;
  isFlag: boolean;
}

// ────────────────────────────────────────────────
// 純関数ヘルパー
// ────────────────────────────────────────────────

/** "--foo" → {long, "foo"} / "-x" → {short, "x"} */
function parseSpecKey(key: SpecKey): ParsedSpecKey {
  if (key.startsWith("--")) return { kind: "long", name: key.slice(2) };
  if (key.startsWith("-") && key.length === 2)
    return { kind: "short", name: key.slice(1) };
  throw new Error(`arg: invalid spec key '${key}'`);
}

/** flag は値を取らない bool、それ以外は string で multiple 受け取る */
function buildParseOption(isFlag: boolean): ParseArgsOption {
  return isFlag
    ? { type: "boolean", multiple: false }
    : { type: "string", multiple: true };
}

function isFlagHandler(fn: Handler): boolean {
  return (fn as any)[flagSymbol] === true;
}

/** alias を辿って終端の handler キーを得る */
function resolveAlias(
  key: SpecKey,
  aliases: Record<SpecKey, SpecKey>,
): SpecKey {
  let current = key;
  const seen = new Set<SpecKey>();
  while (current in aliases) {
    if (seen.has(current)) throw new Error(`arg: alias loop at ${current}`);
    seen.add(current);
    current = aliases[current];
  }
  return current;
}

/** spec を handler と alias に二分する */
function splitSpec(spec: Spec): {
  handlers: Record<SpecKey, HandlerEntry>;
  aliases: Record<SpecKey, SpecKey>;
} {
  const handlers: Record<SpecKey, HandlerEntry> = {};
  const aliases: Record<SpecKey, SpecKey> = {};
  for (const key of Object.keys(spec)) {
    const entry = spec[key];
    if (typeof entry === "string") {
      aliases[key] = entry;
    } else if (typeof entry === "function") {
      handlers[key] = { fn: entry, isFlag: isFlagHandler(entry) };
    } else {
      throw new TypeError(`arg: spec[${key}] must be a function or alias`);
    }
  }
  return { handlers, aliases };
}

/**
 * parseArgs 用の options と、token から spec key を引くための逆引き表を組み立てる。
 * - handler は kind に応じて long / short(自身を short に持つ long) として登録
 * - long→ alias は独立した long として登録 (token 処理時に終端 handler に解決)
 * - short→ alias は既存 long の short プロパティに付与
 */
function buildParseOptions(
  handlers: Record<SpecKey, HandlerEntry>,
  aliases: Record<SpecKey, SpecKey>,
): {
  parseOptions: NonNullable<ParseArgsConfig["options"]>;
  nameToSpecKey: Record<ParseArgsName, SpecKey>;
} {
  const parseOptions: NonNullable<ParseArgsConfig["options"]> = {};
  const nameToSpecKey: Record<ParseArgsName, SpecKey> = {};

  const registerOption = (specKey: SpecKey, isFlag: boolean): void => {
    const parsed = parseSpecKey(specKey);
    const opt = buildParseOption(isFlag);
    if (parsed.kind === "short") opt.short = parsed.name;
    parseOptions[parsed.name] = opt;
    nameToSpecKey[parsed.name] = specKey;
  };

  for (const [specKey, handler] of Object.entries(handlers)) {
    registerOption(specKey, handler.isFlag);
  }

  for (const [aliasKey, target] of Object.entries(aliases)) {
    const resolvedKey = resolveAlias(target, aliases);
    const handler = handlers[resolvedKey];
    if (!handler) {
      throw new Error(`arg: alias '${aliasKey}' -> '${target}' has no handler`);
    }
    const aliasParsed = parseSpecKey(aliasKey);
    if (aliasParsed.kind === "long") {
      registerOption(aliasKey, handler.isFlag);
    } else {
      const targetParsed = parseSpecKey(resolvedKey);
      const opt = parseOptions[targetParsed.name];
      if (opt) opt.short = aliasParsed.name;
    }
  }

  return { parseOptions, nameToSpecKey };
}

// ────────────────────────────────────────────────
// 公開関数
// ────────────────────────────────────────────────

/**
 * arg ライブラリ互換の引数パーサ。Node 標準 `util.parseArgs` の薄いラッパ。
 *
 * 処理の流れ:
 *   1. spec を handlers (関数) と aliases (string) に二分
 *   2. parseArgs 用 options と「name → spec key」逆引きを構築
 *   3. parseArgs を tokens: true で実行 (引数の出現順を保つため)
 *   4. token を順に走査 → alias を解決 → 終端 handler を発火
 *      位置引数は result._ に集める
 */
function arg<T extends Spec>(spec: T, options: Options = {}): Result<T> {
  const argv = options.argv ?? process.argv.slice(2);

  // 1
  const { handlers, aliases } = splitSpec(spec);

  // 2
  const { parseOptions, nameToSpecKey } = buildParseOptions(handlers, aliases);

  // 3
  const parsed = parseArgs({
    args: argv,
    options: parseOptions,
    tokens: true,
    allowPositionals: true,
    strict: false,
  });

  // 4
  const result: { _: string[] } & Record<string, any> = { _: [] };
  for (const token of parsed.tokens ?? []) {
    if (token.kind === "positional") {
      result._.push(token.value);
      continue;
    }
    if (token.kind !== "option") continue;

    const specKey = nameToSpecKey[token.name];
    if (!specKey) continue; // 未知オプションは黙って捨てる (kit では未使用)

    const resolvedKey =
      typeof spec[specKey] === "string"
        ? resolveAlias(specKey, aliases)
        : specKey;
    const handler = handlers[resolvedKey];
    if (!handler) continue;

    const value = handler.isFlag ? true : token.value;
    result[resolvedKey] = handler.fn(value, specKey, result[resolvedKey]);
  }

  return result as Result<T>;
}

function flag<T extends Handler>(fn: T): T {
  (fn as any)[flagSymbol] = true;
  return fn;
}

arg.flag = flag;

export default arg;
