import { Logger } from "../services";
import { GitObject, NonNullGitObject, OID } from "~/types";

export function getMockedMethod<T>(Cls: T, method: keyof T, index: number = 0) {
  const Mocked = (Cls as unknown) as jest.Mock<T>;
  const instance = Mocked.mock.instances[index];
  const _method = instance[method];
  return (_method as unknown) as jest.Mock<typeof _method>;
}

export function makeLogger(): Logger {
  return {
    level: "debug",
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/**
 * GitObjectへoidを設定する
 */
export function setOid(
  o: GitObject,
  oid: OID = "3a3c4ec0ae9589c881029c161dd129bcc318dc08"
): NonNullGitObject {
  o.oid = oid;
  return o as NonNullGitObject;
}
