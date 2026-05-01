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

type RightClosedInterval = [start: IntervalEndpoint, end: IntervalEndpoint];

interface InclusiveIntervalEndpoint {
  value: number;
  inclusive: true;
}

interface ExclusiveIntervalEndpoint {
  value: number;
  inclusive: false;
}
type IntervalEndpoint = InclusiveIntervalEndpoint | ExclusiveIntervalEndpoint;

/**
 * startからendまでの数字列を生成するイテレータを返します。終了点は含まれません。
 * @param start
 * @param end
 * @param step
 */
export function* range(start: number, end: number, step = 1) {
  const rightClosedInterval = range.rightClosedInterval(start, end);
  const [startEndpoint, endEndpoint] = rightClosedInterval;
  for (let i = startEndpoint.value; i < endEndpoint.value; i += step) {
    yield i;
  }
}

range.rightClosedInterval = function (
  start: number,
  end: number,
): RightClosedInterval {
  if (start > end) {
    throw new Error("start must be less than or equal to end");
  }
  return [range.including(start), range.excluding(end)];
};

range.including = function (start: number): InclusiveIntervalEndpoint {
  return { value: start, inclusive: true };
};

range.excluding = function (start: number): ExclusiveIntervalEndpoint {
  return { value: start, inclusive: false };
};

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
