import { expect } from "vitest";
import type { ErrorConstructor } from "../util";

export async function assertAsyncError(
  actual: Promise<any>,
  expected: ErrorConstructor,
) {
  await expect(actual).rejects.toThrow(expected);
}
