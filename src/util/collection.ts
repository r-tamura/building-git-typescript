type Initializer<T, S> = (hash: Hash<T, S>, key: T) => void;

/**
 * 値がセットされていないキーへアクセスする場合に初期化関数を呼び出して、初期化された値を返すMap
 */
export class Hash<T, S> extends Map<T, S> {
  #init: Initializer<T, S>;
  constructor(init: Initializer<T, S>) {
    super();
    this.#init = init;
  }

  get(key: T): S {
    if (!super.has(key)) {
      this.#init(this, key);
    }
    // 直前で初期化を行うのでかならず値がを持つ
    return super.get(key) as S;
  }
}

/**
 * s1がs2のスーパーセットであるかを判定します
 */
export function superset<T>(s1: Set<T>, s2: Set<T>) {
  for (const v2 of s2) {
    if (!s1.has(v2)) {
      return false;
    }
  }
  return true;
}

/*
 * 2つのSetが全て同じ値を持つかを判定します。
 */
export function equal<T>(s1: Set<T>, s2: Set<T>) {
  if (s1.size !== s2.size) {
    return false;
  }
  return superset(s1, s2);
}

export function merge<T>(s1: Set<T>, s2: Set<T>) {
  return new Set([...s1, ...s2]);
}
