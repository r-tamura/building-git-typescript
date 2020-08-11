export async function toArray<T>(asyncIt: AsyncIterable<T>) {
  const array = [] as T[];
  for await (const x of asyncIt) {
    array.push(x);
  }
  return array;
}

export async function* reverse<T>(asyncIt: AsyncIterable<T>) {
  const results = await toArray(asyncIt);
  for (const x of results.reverse()) {
    yield Promise.resolve(x);
  }
}
