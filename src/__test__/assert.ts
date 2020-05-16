import { ErrorConstructor } from "../util";

export async function assertAsyncError(
  actual: Promise<any>,
  expected: ErrorConstructor
) {
  await expect(actual).rejects.toThrow(expected);
}
