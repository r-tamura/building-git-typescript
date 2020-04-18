import { Refs } from "./refs";
import { Environment } from "./types";
import { Repository } from "./repository";
import { defaultFs, defaultProcess } from "./services";
import * as assert from "assert";
import { makeLogger } from "./__test__/util";

jest.mock("./refs");
let MockedRefs = (Refs as unknown) as jest.Mock<Partial<Refs>>;

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
  const _ = repo.refs;
  repo.refs;

  it("初期化は初回のみ", () => {
    assert.equal(MockedRefs.mock.calls.length, 1);
  });

  it("refs path", () => {
    assert.equal(MockedRefs.mock.calls[0][0], ".git");
  });
});
