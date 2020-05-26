import * as T from "./helper";
import { stripIndent } from "~/util";
import { CompleteCommit } from "~/types";

const t = T.create();

beforeEach(t.beforeHook);
afterEach(t.afterHook);

describe("log", () => {
  async function commitFile(message: string, time?: Date) {
    await t.writeFile("file.txt", message);
    await t.kitCmd("add", ".");
    await t.commit(message, time);
  }

  describe("with a chain of commits", () => {
    //   o---o---o
    //   A   B   C
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

    it("prints a log with a specified commit", async () => {
      await t.kitCmd("log", "--pretty=oneline", "@^");

      t.assertInfo(stripIndent`
        ${commits[1].oid} B
        ${commits[2].oid} A
      `);
    });
  });

  describe("with a tree of commits", () => {
    let branchTime: Date;
    let master: string[];
    let topic: string[];
    beforeEach(async () => {
      //  m1  m2  m3
      //   o---o---o [master]
      //        \
      //         o---o---o---o [topic]
      //        t1  t2  t3  t4
      branchTime = new Date();
      for (const n of ["1", "2", "3"]) {
        await commitFile(`master-${n}`, branchTime);
      }
      await t.kitCmd("branch", "topic", "master^");
      await t.kitCmd("checkout", "topic");

      const _10secLater = branchTime.getSeconds() + 10;
      branchTime.setSeconds(_10secLater);

      for (const n of ["1", "2", "3", "4"]) {
        await commitFile(`topic-${n}`, branchTime);
      }
      master = [];
      topic = [];
      for (const n of ["0", "1", "2"]) {
        const oid = await t.resolveRevision(`master~${n}`);
        master.push(oid);
      }
      for (const n of ["0", "1", "2", "3"]) {
        const oid = await t.resolveRevision(`topic~${n}`);
        topic.push(oid);
      }
    });

    it("logs the combined history of multiple branches", async () => {
      await t.kitCmd(
        "log",
        "--pretty=oneline",
        "--decorate=short",
        "master",
        "topic"
      );

      t.assertInfo(stripIndent`
        ${topic[0]} (HEAD -> topic) topic-4
        ${topic[1]} topic-3
        ${topic[2]} topic-2
        ${topic[3]} topic-1
        ${master[0]} (master) master-3
        ${master[1]} master-2
        ${master[2]} master-1
      `);
    });
  });
});
