export function shallowEqual<T>(o1: T, o2: T) {
  return Object.entries(o1).every(([k, v]) => {
    return v === o2[k as keyof T];
  });
}

/**
 * オブジェクトのプロパティを取得する関数を返します。
 * k -> {k: a} -> a
 * @param key プロパティキー
 */
export const prop = <T, K extends keyof T>(key: K) => (o: T): T[K] => o[key];

export function isempty(object: Record<string, any>): boolean {
  return object instanceof Object && Object.keys(object).length === 0;
}
