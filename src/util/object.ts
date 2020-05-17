export function shallowEqual<T>(o1: T, o2: T) {
  return Object.entries(o1).every(([k, v]) => {
    return v === (o2 as any)[k];
  });
}
