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
