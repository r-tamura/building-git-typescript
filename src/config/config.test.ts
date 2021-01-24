import { promises as fs } from "fs";
import * as path from "path";
import * as assert from "power-assert";
import { Config, SectionName } from "./config";
import { Conflict } from "./config";
import { rmrf } from "../services";
import { Pathname } from "../types";
import { stripIndent } from "../util";

const testDir = "./test-config";
beforeEach(async () => {
  const pathname = path.join(testDir, "config");
  await fs.mkdir(path.resolve(testDir));
  await fs.writeFile(pathname, "");
});

afterEach(async () => {
  await rmrf(fs, testDir);
});

describe("Config", () => {
  let pathname: Pathname;
  let config: Config;
  async function openConfig() {
    const config = new Config(pathname);
    await config.open();
    return config;
  }

  beforeEach(async () => {
    pathname = path.join(testDir, path.basename("config"));
    config = await openConfig();
  });

  describe("in memory", () => {
    it("returns null for unknown key", () => {
      const actual = config.get(["core", "editor"]);
      assert.equal(actual, null);
    });

    it("returns the value for a known key", () => {
      config.set(["core", "editor"], "ed");
      assert.equal(config.get(["core", "editor"]), "ed");
    });

    it("treats section names as case-insensitive", () => {
      config.set(["core", "editor"], "ed");
      assert.equal(config.get(["Core", "editor"]), "ed");
    });

    it("treats variable names as case-insensitive", () => {
      config.set(["core", "editor"], "ed");
      assert.equal(config.get(["core", "Editor"]), "ed");
    });

    it("retrieves values from subsections", () => {
      config.set(["branch", "master", "remote"], "origin");
      assert.equal(config.get(["branch", "master", "remote"]), "origin");
    });

    it("treats subsection names as case-sensitive", () => {
      config.set(["branch", "master", "remote"], "origin");
      assert.equal(config.get(["branch", "Master", "remote"]), null);
    });

    describe("with multi-valued keys", () => {
      let key: SectionName;
      beforeEach(() => {
        key = ["remote", "origin", "fetch"];
        config.add(key, "master");
        config.add(key, "topic");
      });

      it("adds multiple values for a key", () => {
        assert.equal(config.get(key), "topic");
        assert.deepEqual(config.getAll(key), ["master", "topic"]);
      });

      it("refuses to set a value", () => {
        assert.throws(() => config.set(key, "new-value"), Conflict);
      });

      it("replaces all the values", () => {
        config.replaceAll(key, "new-value");
        assert.deepEqual(config.getAll(key), ["new-value"]);
      });

      it("refuses to unset a value", () => {
        assert.throws(() => config.unset(key), Conflict);
      });

      it("unsets all the values", () => {
        config.unsetAll(key);
        assert.deepEqual(config.getAll(key), []);
      });
    });
  });

  describe("file storage", () => {
    async function assertFile(contents: string) {
      assert.equal(await fs.readFile(pathname, "utf8"), contents);
    }

    beforeEach(async () => {
      await config.openForUpdate();
    });

    it("writes a single setting", async () => {
      config.set(["core", "editor"], "ed");
      await config.save();

      await assertFile(stripIndent`
        [core]
        \teditor = ed

      `);
    });

    it("writes multiple settings", async () => {
      config.set(["core", "editor"], "ed");
      config.set(["user", "name"], "A. U. Thor");
      config.set(["Core", "bare"], true);
      await config.save();

      await assertFile(stripIndent`
        [core]
        \teditor = ed
        \tbare = true
        [user]
        \tname = A. U. Thor

      `);
    });

    it("writes multiple subsections", async () => {
      config.set(["branch", "master", "remote"], "origin");
      config.set(["branch", "Master", "remote"], "another");
      await config.save();

      await assertFile(stripIndent`
        [branch "master"]
        \tremote = origin
        [branch "Master"]
        \tremote = another

      `);
    });

    it("overwrites a variable with a matching name", async () => {
      config.set(["merge", "conflictstyle"], "diff3");
      config.set(["merge", "ConflictStyle"], "none");
      await config.save();

      await assertFile(stripIndent`
        [merge]
        \tConflictStyle = none

      `);
    });

    it("removes a section", async () => {
      config.set(["core", "editor"], "ed");
      config.set(["remote", "origin", "url"], "ssh://example.com/repo");
      config.removeSection(["core"]);
      await config.save();

      await assertFile(stripIndent`
        [remote "origin"]
        \turl = ssh://example.com/repo

      `);
    });

    it("removes a subsection", async () => {
      config.set(["core", "editor"], "ed");
      config.set(["remote", "origin", "url"], "ssh://example.com/repo");
      config.removeSection(["remote", "origin"]);
      await config.save();

      await assertFile(stripIndent`
        [core]
        \teditor = ed

      `);
    });

    it("unset a variable", async () => {
      config.set(["merge", "conflictstyle"], "diff3");
      config.unset(["merge", "ConflictStyle"]);
      await config.save();

      await assertFile("");
    });

    it("retrieves persisted settings", async () => {
      config.set(["core", "editor"], "ed");
      await config.save();

      assert.equal(
        await openConfig().then((config) => config.get(["core", "editor"])),
        "ed",
      );
    });

    it("retrieves variables from subsections", async () => {
      config.set(["branch", "master", "remote"], "origin");
      config.set(["branch", "Master", "remote"], "another");
      await config.save();

      assert.equal(
        await openConfig().then((config) =>
          config.get(["branch", "master", "remote"]),
        ),
        "origin",
      );
      assert.equal(
        await openConfig().then((config) =>
          config.get(["branch", "Master", "remote"]),
        ),
        "another",
      );
    });

    it("retrieves variables from subsections including dots", async () => {
      config.set(["url", "git@github.com:", "insteadOf"], "gh:");
      await config.save();

      assert.equal(
        await openConfig().then((config) =>
          config.get(["url", "git@github.com:", "insteadOf"]),
        ),
        "gh:",
      );
    });

    it("retains the formatting of existing settings", async () => {
      config.set(["core", "Editor"], "ed");
      config.set(["user", "Name"], "A. U. Thor");
      config.set(["core", "Bare"], true);
      await config.save();

      const newconfig = await openConfig();
      await newconfig.openForUpdate();
      newconfig.set(["Core", "bare"], false);
      await newconfig.save();

      await assertFile(stripIndent`
        [core]
        \tEditor = ed
        \tbare = false
        [user]
        \tName = A. U. Thor

      `);
    });
  });
});
