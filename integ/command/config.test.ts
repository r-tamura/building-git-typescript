import { stripIndent } from "../../src/util";
import * as T from "./helper";

const t = T.create("config");

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("config", () => {
  it("returns 1 for unknown variable", async () => {
    await t.kitCmd("config", "--local", "no.such");
    t.assertStatus(1);
  });

  it("returns 1 when the key is invalid", async () => {
    await t.kitCmd("config", "--local", "0.0");
    t.assertStatus(1);
    t.assertError("error: invalid key: 0.0");
  });

  it("returns 2 when no section is given", async () => {
    await t.kitCmd("config", "--local", "no");
    t.assertStatus(2);
    t.assertError("error: key does not contain a section: no");
  });

  it("returns the value of a set variable", async () => {
    await t.kitCmd("config", "core.editor", "ed");
    await t.kitCmd("config", "--local", "Core.Editor");

    t.assertStatus(0);
    t.assertInfo("ed");
  });

  it("returns the value of a set variable in a subsection", async () => {
    await t.kitCmd("config", "remote.origin.url", "git@github.com:author.kit");
    await t.kitCmd("config", "--local", "Remote.origin.URL");

    t.assertStatus(0);
    t.assertInfo("git@github.com:author.kit");
  });

  it("unsets a variable", async () => {
    await t.kitCmd("config", "core.editor", "ed");
    await t.kitCmd("config", "--unset", "core.editor");

    await t.kitCmd("config", "--local", "Core.Editor");
    t.assertStatus(1);
  });

  describe("with multi-valued variables", () => {
    beforeEach(async () => {
      await t.kitCmd("config", "--add", "remote.origin.fetch", "master");
      await t.kitCmd("config", "--add", "remote.origin.fetch", "topic");
    });

    it("returns the last value", async () => {
      await t.kitCmd("config", "remote.origin.fetch");
      t.assertStatus(0);
      t.assertInfo("topic");
    });

    it("returns all the values", async () => {
      await t.kitCmd("config", "--get-all", "remote.origin.fetch");
      t.assertStatus(0);

      t.assertInfo(stripIndent`
        master
        topic
      `);
    });

    it("returns 5 on trying to set a variable", async () => {
      await t.kitCmd("config", "remote.origin.fetch", "new-value");
      t.assertStatus(5);

      await t.kitCmd("config", "--get-all", "remote.origin.fetch");
      t.assertStatus(0);
      t.assertInfo(stripIndent`
        master
        topic
    `);
    });

    it("replaces a variable", async () => {
      await t.kitCmd("config", "--replace-all", "remote.origin.fetch", "new-value");

      await t.kitCmd("config", "--get-all", "remote.origin.fetch");
      t.assertStatus(0);
      t.assertInfo("new-value");
    });

    it("returns 5 on trying to unset a variable", async () => {
      await t.kitCmd("config", "--unset", "remote.origin.fetch");
      t.assertStatus(5);

      await t.kitCmd("config", "--get-all", "remote.origin.fetch");
      t.assertStatus(0);

      t.assertInfo(stripIndent`
        master
        topic
      `);
    });

    it("unsets a variable", async () => {
      await t.kitCmd("config", "--unset-all", "remote.origin.fetch");

      await t.kitCmd("config", "--get-all", "remote.origin.fetch");
      t.assertStatus(1);
    });
  });

  it("removes a section", async () => {
    await t.kitCmd("config", "core.editor", "ed");
    await t.kitCmd("config", "remote.origin.url", "ssh://example.com/repo");
    await t.kitCmd("config", "--remove-section", "core");

    await t.kitCmd("config", "--local", "remote.origin.url");
    t.assertStatus(0);
    t.assertInfo("ssh://example.com/repo");

    await t.kitCmd("config", "--local", "core.editor");
    t.assertStatus(1);
  });

  it("removes a subsection", async () => {
    await t.kitCmd("config", "core.editor", "ed");
    await t.kitCmd("config", "remote.origin.url", "ssh://example.com/repo");
    await t.kitCmd("config", "--remove-section", "remote.origin");

    await t.kitCmd("config", "--local", "core.editor");
    t.assertStatus(0);
    t.assertInfo("ed");

    await t.kitCmd("config", "--local", "remote.origin.url");
    t.assertStatus(1);
  });
});
