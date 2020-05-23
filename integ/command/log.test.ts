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
      await t.kitCmd("branch", "topic", "@^");
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
  });
});
