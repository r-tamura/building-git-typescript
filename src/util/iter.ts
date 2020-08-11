/*
 * Iterableオブジェクトを扱う関数
 */
export function some<T>(iter: Iterable<T>, pred: (t: T) => boolean) {
  for (const t of iter) {
    if (pred(t)) {
      return true;
    }
  }
  return false;
}

/**
 * startからendまでの数字列を生成するイテレータを返します
 * @param start
 * @param end
 * @param step
 */
export function* range(start = 0, end = 0, step = 1) {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}

export function* times(count: number) {
  for (let i = 0; i < count; i++) {
    yield i;
  }
}

export function* reverse<T>(iter: Iterable<T>) {
  for (const x of Array.from(iter).reverse()) {
    yield x;
  }
}
