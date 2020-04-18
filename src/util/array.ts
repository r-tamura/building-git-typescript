interface Callback<T> {
  (value: T): Promise<void>;
  (value: T, index: number): Promise<void>;
  (value: T, index: number, array: T[]): Promise<void>;
}
export async function asyncForEach<T>(fn: Callback<T>, xs: T[]) {
  for (let i = 0; i < xs.length; i++) {
    await fn(xs[i] as T, i, xs);
  }
  return;
}
