import { stripIndent } from "../../src/util";
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

    it("lists the remote", async () => {
      await t.kitCmd("remote");
      t.assertInfo("origin");
    });

    it("lists the remote with its URLs", async () => {
      await t.kitCmd("remote", "--verbose");

      t.assertInfo(stripIndent`
        origin\tssh://example.com/repo (fetch)
        origin\tssh://example.com/repo (push)
      `);
    });

    it("sets a catch-all fetch refspec", async () => {
      await t.kitCmd("config", "--local", "--get-all", "remote.origin.fetch");

      t.assertInfo("+refs/heads/*:refs/remotes/origin/*");
    });
  });

  describe("adding a remote with tracking branches", () => {
    beforeEach(async () => {
      await t.kitCmd(
        "remote",
        "add",
        "origin",
        "ssh://example.com/repo",
        "-t",
        "master",
        "-t",
        "topic"
      );
    });

    it("sets a fetch refspec fro each branch", async () => {
      await t.kitCmd("config", "--local", "--get-all", "remote.origin.fetch");

      t.assertInfo(stripIndent`
        +refs/heads/master:refs/remotes/origin/master
        +refs/heads/topic:refs/remotes/origin/topic
      `);
    });
  });

  describe("removing a remote", () => {
    beforeEach(async () => {
      await t.kitCmd("remote", "add", "origin", "ssh://example.com/repo");
    });

    it("removes the remote", async () => {
      await t.kitCmd("remote", "remove", "origin");
      t.assertStatus(0);

      await t.kitCmd("remote");
      t.assertInfo("");
    });

    it("fails to remove a missing remote", async () => {
      await t.kitCmd("remote", "remove", "no-such");
      t.assertStatus(128);
      t.assertError("fatal: No such remote: no-such");
    });
  });
});
