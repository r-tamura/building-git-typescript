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

export async function asyncMap<T, U>(fn: (t: T) => Promise<U>, xs: T[]) {
  const promises: Promise<U>[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    promises.push(fn(x));
  }
  return Promise.all(promises);
}

export function clone<T>(xs: T[]): T[] {
  return [...xs];
}

function jsindex(xs: any[], index: number) {
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
      }`
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
