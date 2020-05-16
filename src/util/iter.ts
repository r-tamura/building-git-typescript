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
