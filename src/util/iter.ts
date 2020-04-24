export function* range(start = 0, end = 0, step = 1) {
  for (let i = start; i < end; i += step) {
    yield i;
  }
}
