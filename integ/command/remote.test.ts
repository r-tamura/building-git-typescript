import * as T from "./helper";

const t = T.create("remote");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("remote", () => {
  describe("adding a remote", () => {
    beforeEach(async () => {
      await t.kitCmd("remote", "add", "origin", "ssh://example.com/repo");
    });

    it("fails to add an existing remote", async () => {
      await t.kitCmd("remote", "add", "origin", "url");
      t.assertStatus(128);
      t.assertError("fatal: remote origin already exists.");
    });
  });

  describe("removing a remote", () => {
    beforeEach(async () => {
      await t.kitCmd("remote", "add", "origin", "ssh://example.com/repo");
    });

    it("removes the remote", async () => {
      await t.kitCmd("remote", "remove", "origin");
      t.assertStatus(0);
    });

    it("fails to remove a missing remote", async () => {
      await t.kitCmd("remote", "remove", "no-such");
      t.assertStatus(128);
      t.assertError("fatal: No such remote: no-such");
    });
  });
});
