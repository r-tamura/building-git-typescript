export function getMockedMethod<T>(Cls: T, method: keyof T, index: number = 0) {
  const Mocked = (Cls as unknown) as jest.Mock<T>;
  const instance = Mocked.mock.instances[index];
  const _method = instance[method];
  return (_method as unknown) as jest.Mock<typeof _method>;
}
