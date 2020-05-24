import * as T from "./helper";
import { stripIndent } from "~/util";
import { CompleteCommit } from "~/types";

const t = T.create();

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("log", () => {
  async function commitFile(message: string) {
    await t.writeFile("file.txt", message);
    await t.kitCmd("add", ".");
    await t.commit(message);
  }

  describe("with a chain of commits", () => {
    const commits: CompleteCommit[] = [];
    beforeEach(async () => {
      const messages = ["A", "B", "C"];
      for (const msg of messages) {
        await commitFile(msg);
      }
      await t.kitCmd("branch", "topic", "@^^");
      for await (const o of ["@", "@^", "@^^"].map(t.loadCommit.bind(t))) {
        commits.push(o as CompleteCommit);
      }
    });
    afterEach(() => {
      commits.length = 0;
    });

    it("prints a log in medium format", async () => {
      await t.kitCmd("log");

      t.assertInfo(stripIndent`
        commit ${commits[0].oid}
        Author: A. U. Thor <author@example.com>
        Date:   ${commits[0].author.readableTime}

            C

        commit ${commits[1].oid}
        Author: A. U. Thor <author@example.com>
        Date:   ${commits[1].author.readableTime}

            B

        commit ${commits[2].oid}
        Author: A. U. Thor <author@example.com>
        Date:   ${commits[2].author.readableTime}

            A
      `);
    });

    it("prints a log in medium format with abbreviated commit IDs", async () => {
      await t.kitCmd("log", "--abbrev-commit");

      t.assertInfo(stripIndent`
        commit ${t.repo().database.shortOid(commits[0].oid)}
        Author: A. U. Thor <author@example.com>
        Date:   ${commits[0].author.readableTime}

            C

        commit ${t.repo().database.shortOid(commits[1].oid)}
        Author: A. U. Thor <author@example.com>
        Date:   ${commits[1].author.readableTime}

            B

        commit ${t.repo().database.shortOid(commits[2].oid)}
        Author: A. U. Thor <author@example.com>
        Date:   ${commits[2].author.readableTime}

            A
      `);
    });

    it("prints a log in oneline format", async () => {
      await t.kitCmd("log", "--oneline");

      t.assertInfo(stripIndent`
        ${t.repo().database.shortOid(commits[0].oid)} C
        ${t.repo().database.shortOid(commits[1].oid)} B
        ${t.repo().database.shortOid(commits[2].oid)} A
      `);
    });

    it("prints a log with short decorations", async () => {
      await t.kitCmd("log", "--pretty=oneline", "--decorate=short");

      t.assertInfo(stripIndent`
        ${commits[0].oid} (HEAD -> master) C
        ${commits[1].oid} B
        ${commits[2].oid} (topic) A
      `);
    });

    it("prints a log with detached HEAD", async () => {
      await t.kitCmd("checkout", "@");
      await t.kitCmd("log", "--pretty=oneline", "--decorate=short");

      t.assertInfo(stripIndent`
      ${commits[0].oid} (HEAD, master) C
      ${commits[1].oid} B
      ${commits[2].oid} (topic) A
      `);
    });

    it("prints a log with detached HEAD", async () => {
      await t.kitCmd("log", "--pretty=oneline", "--decorate=full");

      t.assertInfo(stripIndent`
      ${commits[0].oid} (HEAD -> refs/heads/master) C
      ${commits[1].oid} B
      ${commits[2].oid} (refs/heads/topic) A
      `);
    });

    it("prints a log witch patches", async () => {
      await t.kitCmd("log", "--pretty=oneline", "--patch");

      t.assertInfo(stripIndent`
        ${commits[0].oid} C
        diff --git a/file.txt b/file.txt
        index 7371f47..96d80cd 100644
        --- a/file.txt
        +++ b/file.txt
        @@ -1,1 +1,1 @@
        -B
        +C
        ${commits[1].oid} B
        diff --git a/file.txt b/file.txt
        index 8c7e5a6..7371f47 100644
        --- a/file.txt
        +++ b/file.txt
        @@ -1,1 +1,1 @@
        -A
        +B
        ${commits[2].oid} A
        diff --git a/file.txt b/file.txt
        new file mode 100644
        index 0000000..8c7e5a6
        --- /dev/null
        +++ b/file.txt
        @@ -0,0 +1,1 @@
        +A
      `);
    });
  });
});
