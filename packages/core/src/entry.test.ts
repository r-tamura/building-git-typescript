import { describe, it } from "vitest";
import assert from "node:assert";
import { mockFsStats } from "./__test__/fs.js";
import { Entry } from "./entry.js";
import { posixPath } from "./util/fs.js";

describe("Entry#mode", () => {
  it.each([
    ["100755", Entry.EXECUTABLE_MODE],
    ["100644", Entry.REGULAR_MODE],
    ["100655", Entry.REGULAR_MODE],
  ])("ファイルモード: %s", (osMode: string, expectedGitMode: string) => {
    // Arrange
    const stats = mockFsStats();
    stats.mode = Number.parseInt(osMode, 8);
    // Act
    const entry = new Entry(
      posixPath("/test/repo"),
      "cc628ccd10742baea8241c5924df992b5c019f71",
      stats,
    );
    const actual = entry.mode;

    // Assert
    assert.equal(actual, expectedGitMode);
  });
});
