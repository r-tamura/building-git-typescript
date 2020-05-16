import * as t from "./helper";
import * as assert from "power-assert";
import { stripIndent } from "~/util";

describe("", () => {
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  beforeEach(async () => {
    await t.writeFile("hello.txt", "hello");
    await t.jitCmd("add", ".");
    await t.commit("first commit");
  });
  it("HEADから新しいブランチを作る", async () => {
    // Act
    await t.jitCmd("branch", "master");

    // Assert
    assert.equal(
      await t.repo().refs.readRef("master"),
      await t.repo().refs.readHead()
    );
  });

  it("特定のコミットから新しいブランチを作る", async () => {
    // Arrange
    await t.writeFile("hello.txt", "changed");
    await t.commit("second commit");

    // Act
    await t.jitCmd("branch", "topic", "HEAD^");

    // Assert
    assert.equal(
      "8b86eb4ae21c63c6b983509337e797cab17ec6ad",
      await t.repo().refs.readRef("topic")
    );
  });

  it("コミットIDのプレフィックスから新しいブランチを作る", async () => {
    // Arrange
    await t.writeFile("hello.txt", "changed");
    await t.commit("second commit");

    // Act
    await t.jitCmd("branch", "topic", "8b86eb");

    // Assert
    assert.equal(
      await t.repo().refs.readRef("topic"),
      "8b86eb4ae21c63c6b983509337e797cab17ec6ad"
    );
  });

  it("コミットIDプレフィックスに該当するオブジェクトが存在しないとき、エラーメッセージを表示する", async () => {
    // Act
    await t.jitCmd("branch", "topic", "aaaaaa~1");

    // Assert
    t.assertError(stripIndent`
      fatal: Not a valid object name: 'aaaaaa~1'.
    `);
    t.assertStatus(128);
  });

  it("コミットIDプレフィックスの該当オブジェクトがcommitでないとき、エラーメッセージを表示する", async () => {
    // Act
    await t.jitCmd("branch", "topic", "b6fc4c6");

    // Assert
    t.assertError(stripIndent`
      error: object b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0 is a blob, not a commit
      fatal: Not a valid object name: 'b6fc4c6'.
    `);
    t.assertStatus(128);
  });
});
