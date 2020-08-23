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

  get(key: T) {
    if (!super.has(key)) {
      this.#init(this, key);
    }
    // 直前で初期化を行うのでかならず値がを持つ
    return super.get(key)!;
  }

  getOrInsert(key: T, init: Initializer<T, S>) {
    if (!super.has(key)) {
      init(this, key);
    }
    // 直前で初期化を行うのでかならず値がを持つ
    return super.get(key)!;
  }
}

type Serialize<T extends object> = (o: T) => string;
type Deserialize<T extends object> = (s: string) => T;

/**
 * オブジェクトをキーとすることができるハッシュマップ
 * ビルトインのMapではオブジェクトをキーとした場合、参照同値でないとキーが一致しない
 *
 * @example
 * const key = { prop1: "a", prop2: "b" }
 * const map = new Map()
 * map.set(key, 1)
 * map.get(key) // undefined
 *
 * const hash = ObjectKeyHash(key => key.prop1 + ":" + key.pro2, str => { const [prop1, prop2] = str.split(":"); return { prop1, prop2 } })
 * hash.set(key, 1)
 * hash.get(key) // 1
 */
export class ObjectKeyHash<T extends object, S = any> {
  #hash: Map<string, S>;
  constructor(private ser: Serialize<T>, private des: Deserialize<T>) {
    this.#hash = new Map();
  }

  get size() {
    return this.#hash.size;
  }

  has(key: T) {
    return this.#hash.has(this.ser(key));
  }

  get(key: T) {
    return this.#hash.get(this.ser(key));
  }

  set(key: T, value: S) {
    this.#hash.set(this.ser(key), value);
    return this;
  }

  delete(key: T) {
    return this.#hash.delete(this.ser(key));
  }

  *keys() {
    for (const key of this.#hash.keys()) {
      yield this.des(key);
    }
  }

  *[Symbol.iterator]() {
    for (const [rawKey, value] of this.#hash) {
      yield [this.des(rawKey), value] as const;
    }
  }
}

/**
 * 非プリミティブ型の値に対応したSet
 */
export class ObjectSet<T extends object> {
  #set: Set<string> = new Set();
  constructor(private ser: Serialize<T>, private des: Deserialize<T>) {}

  get size() {
    return this.#set.size;
  }

  has(v: T) {
    return this.#set.has(this.ser(v));
  }

  add(v: T) {
    this.#set.add(this.ser(v));
    return this;
  }

  delete(v: T) {
    return this.#set.delete(this.ser(v));
  }

  clear() {
    this.#set.clear();
  }

  *[Symbol.iterator]() {
    for (const raw of this.#set) {
      yield this.des(raw);
    }
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
