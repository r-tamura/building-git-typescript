import { vi } from "vitest";
import type { Mock } from "vitest";
import type { Logger } from "../services/index.js";
import type { GitObject, CompleteGitObject, OID } from "../types.js";

export function getMockedMethod<T>(Cls: T, method: keyof T, index = 0) {
  const Mocked = Cls as unknown as Mock;
  const instance = Mocked.mock.instances[index] as T;
  const _method = instance[method];
  return _method as unknown as Mock;
}

export function makeLogger(): Logger {
  return {
    level: "debug",
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * GitObjectへoidを設定する
 */
export function setOid(
  o: GitObject,
  oid: OID = "3a3c4ec0ae9589c881029c161dd129bcc318dc08",
): CompleteGitObject {
  o.oid = oid;
  return o as CompleteGitObject;
}
