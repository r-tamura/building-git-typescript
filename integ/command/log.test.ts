import * as T from "./helper";
import { Commit } from "~/database";
import { stripIndent } from "~/util";
import { NonNullCommit } from "~/types";

const t = T.create();

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("log", () => {
  async function commitFile(message: string) {
    await t.writeFile("file.txt", message);
    await t.jitCmd("add", ".");
    await t.commit(message);
  }

  describe("with a chain of commits", () => {
    const commits: NonNullCommit[] = [];
    beforeEach(async () => {
      const messages = ["A", "B", "C"];
      for (const msg of messages) {
        await commitFile(msg);
      }
      await t.jitCmd("branch", "topic", "@^");
      for await (const o of ["@", "@^", "@^^"].map(t.loadCommit.bind(t))) {
        commits.push(o as NonNullCommit);
      }
    });
    afterEach(() => {
      commits.length = 0;
    });

    it("prints a log in medium format", async () => {
      await t.jitCmd("log");

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
      await t.jitCmd("log", "--abbrev-commit");

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
  });
});
