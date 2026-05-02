import { expect } from "vitest";
import type { ErrorConstructor } from "../util/index.js";

export async function assertAsyncError(
  actual: Promise<any>,
  expected: ErrorConstructor,
) {
  await expect(actual).rejects.toThrow(expected);
}
