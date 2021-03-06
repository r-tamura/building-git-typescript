interface ForEachCallback<T> {
  (value: T): Promise<void>;
  // (value: T, index: number): Promise<void>;
  // (value: T, index: number, array: T[]): Promise<void>;
}

/**
 * 非同期処理関数を一つずつ実行する。(前の処理が完了してから次の処理を開始する)
 * @param fn 非同期処理関数
 * @param xs fnへわたされる引数リスト
 */
export async function asyncForEach<T>(fn: ForEachCallback<T>, xs: T[]) {
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    await fn(x);
  }
  return;
}

export function clone<XS extends unknown[] | []>(xs: XS): XS {
  // 配列のジェネリクス型指定について
  // https://stackoverflow.com/questions/51674820/generics-for-arrays-in-typescript-3-0
  return [...xs];
}

/**
 * 第一引数の配列xsから第二引数の配列ysの要素を除いた配列を返します
 * @param xs
 * @param ys
 */
export function exclude<T>(
  xs: T[],
  ys: T[],
  equal: (x: T, y: T) => boolean = (x, y) => x === y,
) {
  return xs.filter((x) => !ys.find((y) => equal(x, y)));
}

export function isempty<T>(xs: T[]): xs is [] {
  return xs.length === 0;
}

type Primitive = number | string | symbol | bigint | null | undefined;
/**
 * xがリストxsに含まれるかを判定します
 * @params x 判定対象
 * @params xs
 */
export function includes<X extends Primitive, XS extends readonly X[]>(
  x: X,
  xs: XS,
): x is XS[number] {
  return xs.includes(x);
}

function jsindex(xs: unknown[], index: number) {
  // asserts(xs.length <= Math.abs(index), "list index out of range");
  return index >= 0 ? index : xs.length + index;
}

/**
 * 添字indexに対応した配列xsの要素を返します。添字indexが負の場合は配列の最後の要素から数えた添字にある要素を返します
 * @param xs 配列
 * @param index 添字
 *
 * @example 添字が負のとき
 *  const xs = [1, 2, 3, 4]
 *  index(xs, -1) // 4
 *  index(xs, -3) // 2
 *
 */
export function get<T>(xs: T[], index: number): T {
  if (index < -xs.length || xs.length <= index) {
    throw new RangeError(
      `index has to be within array's length. ${-xs.length} <= actual:${index} < ${
        xs.length
      }`,
    );
  }
  const actualIndex = jsindex(xs, index);
  return xs[actualIndex];
}

export function set<T>(xs: T[], index: number, value: T) {
  const actualIndex = jsindex(xs, index);
  xs[actualIndex] = value;
}

export function enumerate<T>(xs: T[]): [T, number][] {
  return xs.map((x, i) => [x, i]);
}

export function find<T>(xs: T[], pred: (x: T) => boolean): T | null {
  const filtered = xs.filter(pred);
  return filtered.length === 0 ? null : filtered[0];
}

/**
 * Arrayの探索系APIの返り値により、探索対象が発見されたかを判定します
 * @param index
 */
export function found(index: number) {
  return index !== -1;
}

export function insert<T>(xs: T[], index: number, x: T): T[] {
  const cloned = clone(xs);
  cloned.splice(index, index, x);
  return cloned;
}

export function first<T>(xs: T[]) {
  return xs[0];
}

export function last<T>(xs: T[]) {
  return xs[xs.length - 1];
}

/**
 * predの条件によりリストxsを2つのリストへ分割します
 * @param xs 分割するリスト
 * @param pred 分割の条件
 */
export function partition<T>(xs: T[], pred: (x: T) => boolean): [T[], T[]] {
  const t: T[] = [];
  const f: T[] = [];
  for (const x of xs) {
    if (pred(x)) {
      t.push(x);
    } else {
      f.push(x);
    }
  }
  return [t, f];
}

export function shallowEqual<T>(xs: T[], ys: T[]) {
  if (xs.length !== ys.length) {
    return false;
  }
  return xs.every((x, i) => x === ys[i]);
}

export function zip<T, S>(xs: T[], ys: S[]) {
  const result = [];
  for (let i = 0; i < xs.length; i++) {
    result.push([xs[i], ys[i]] as const);
  }
  return result;
}

/**
 * 配列を行列と見立てて、行列の転置を行います
 * Ruby Array#tanspose相当だがIndexErrorは発生しない
 * https://docs.ruby-lang.org/ja/latest/method/Array/i/transpose.html
 */
export function transpose<T>(xs: T[][]): T[][] {
  if (!Array.isArray(xs[0])) {
    throw new TypeError("転置は二次元配列に対して実行されます");
  }

  const rowLength = xs[0].length;
  const colLength = xs.length;

  const transposed: T[][] = [];
  for (let i = 0; i < rowLength; i++) {
    for (let j = 0; j < colLength; j++) {
      if (j === 0) {
        transposed[i] = [];
      }
      transposed[i].push(xs[j][i]);
    }
  }
  return transposed;
}

export function compact<T>(xs: readonly T[]): NonNullable<T>[] {
  const notEmpty = (x: T): x is NonNullable<T> => x !== null && x !== undefined;
  return xs.filter(notEmpty);
}

/**
 * 配列の先頭のn要素を除外した残りの配列を返します
 * Ruby Array#drop相当
 * https://docs.ruby-lang.org/ja/latest/method/Array/i/drop.html
 * @param xs 配列
 * @param n 除外する要素数
 */
export function drop<T>(xs: T[], n: number): T[] {
  return xs.filter((x, i) => i >= n);
}

/**
 * 配列から指定された正規表現にマッチする部分文字列を持つもののみを取得して返します
 * @param xs 文字列の配列
 * @param pattern 取得対象パターン
 *
 * @example
 * > grep(["aa", "bb", "cc", "dd"], /[bc]/)
 * ["bb", "cc"]
 */
export function grep<Element extends string>(
  xs: Element[],
  pattern: RegExp,
): Element[] {
  return xs.filter((x) => pattern.test(x));
}
