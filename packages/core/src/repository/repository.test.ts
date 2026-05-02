import { describe, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Refs } from "../refs.js";
import type { Environment } from "../types.js";
import { Repository } from "../repository/index.js";
import { defaultFs, defaultProcess } from "../services/index.js";
import assert from "node:assert";
import { makeLogger } from "../__test__/util.js";

vi.mock("../refs");
const MockedRefs = Refs as unknown as Mock;

const testEnvGlobal: Environment = {
  fs: { ...defaultFs },
  logger: makeLogger(),
  process: { ...defaultProcess },
  date: {
    now: () => new Date(2020, 3, 1),
  },
};

describe("Repository#refs", () => {
  // Arrange
  const gitPath = ".git";

  // Act
  const repo = new Repository(gitPath, testEnvGlobal);
  // Refs インスタンスがキャッシュされている (1回しか new されない) ことを検証するため 2 回触る
  void repo.refs;
  void repo.refs;

  it("初期化は初回のみ", () => {
    assert.equal(MockedRefs.mock.calls.length, 1);
  });

  it("refs path", () => {
    assert.equal(MockedRefs.mock.calls[0][0], ".git");
  });
});
