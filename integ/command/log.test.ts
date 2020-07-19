import * as T from "./helper";
import { OID } from "../../src/types";
import { stripIndent } from "../../src/util";
import { CompleteCommit, Dict } from "../../src/types";

const t = T.create();

beforeEach(t.beforeHook);
afterEach(t.afterHook);

function addSeconds(time: Date, n: number) {
  return new Date(time.getTime() + n * 1000);
}

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
      await t.kitCmd("log", "--pretty=oneline", "--decorate=short", "master", "topic");

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

    it("logs the difference from one branch to another (A..B)", async () => {
      await t.kitCmd("log", "--pretty=oneline", "master..topic");

      t.assertInfo(stripIndent`
        ${topic[0]} topic-4
        ${topic[1]} topic-3
        ${topic[2]} topic-2
        ${topic[3]} topic-1
      `);
    });

    it("logs the difference from one branch to another (^A)", async () => {
      await t.kitCmd("log", "--pretty=oneline", "master", "^topic");

      t.assertInfo(stripIndent`
        ${master[0]} master-3
      `);
    });

    it("excludes a long branch when commit times are euqal", async () => {
      await t.kitCmd("branch", "side", "topic^^");
      await t.kitCmd("checkout", "side");

      for (let i = 1; i <= 10; i++) {
        const n = i.toString();
        await commitFile(`sied-${n}`, branchTime);
      }

      await t.kitCmd("log", "--pretty=oneline", "side..topic", "^master");

      t.assertInfo(stripIndent`
        ${topic[0]} topic-4
        ${topic[1]} topic-3
      `);
    });

    it("logs the last few commits on a branch", async () => {
      await t.kitCmd("log", "--pretty=oneline", "@~3..");

      t.assertInfo(stripIndent`
        ${topic[0]} topic-4
        ${topic[1]} topic-3
        ${topic[2]} topic-2
      `);
    });
  });

  async function commitTree(message: string, files: Dict<string>, time?: Date) {
    await Promise.all(
      Object.entries(files).map(([pathname, contents]) => t.writeFile(pathname, contents))
    );
    await t.kitCmd("add", ".");
    await t.commit(message, time);
  }
  describe("with commits changing differenct files", () => {
    let commits: CompleteCommit[];
    beforeEach(async () => {
      await commitTree("first", {
        "a/1.txt": "1",
        "b/c/2.txt": "2",
      });

      await commitTree("second", {
        "a/1.txt": "10",
        "b/3.txt": "3",
      });

      await commitTree("third", {
        "b/c/2.txt": "4",
      });

      commits = await Promise.all(
        ["@^^", "@^", "@"].map((rev) => t.loadCommit(rev) as Promise<CompleteCommit>)
      );
    });

    it("logs commits that change a directory", async () => {
      await t.kitCmd("log", "--pretty=oneline", "b");

      t.assertInfo(stripIndent`
        ${commits[2].oid} third
        ${commits[1].oid} second
        ${commits[0].oid} first
      `);
    });

    it("logs commits that change a directory and one of its files", async () => {
      await t.kitCmd("log", "--pretty=oneline", "b", "b/3.txt");

      t.assertInfo(stripIndent`
        ${commits[2].oid} third
        ${commits[1].oid} second
        ${commits[0].oid} first
      `);
    });

    it("logs commits that change a nested directory", async () => {
      await t.kitCmd("log", "--pretty=oneline", "b/c");

      t.assertInfo(stripIndent`
        ${commits[2].oid} third
        ${commits[0].oid} first
      `);
    });

    it("logs commits with patches for selected files", async () => {
      await t.kitCmd("log", "--pretty=oneline", "--patch", "a/1.txt");

      t.assertInfo(stripIndent`
        ${commits[1].oid} second
        diff --git a/a/1.txt b/a/1.txt
        index 56a6051..9a03714 100644
        --- a/a/1.txt
        +++ b/a/1.txt
        @@ -1,1 +1,1 @@
        -1
        +10
        ${commits[0].oid} first
        diff --git a/a/1.txt b/a/1.txt
        new file mode 100644
        index 0000000..56a6051
        --- /dev/null
        +++ b/a/1.txt
        @@ -0,0 +1,1 @@
        +1
      `);
    });
  });

  describe("with a graph of commits", () => {
    // A   B   C   D   J   K
    // o---o---o---o---o---o [master]
    //      \         /
    //       o---o---o---o [topic]
    //       E   F   G   H

    let master: OID[];
    let topic: OID[];
    beforeEach(async () => {
      const time = new Date();

      await commitTree("A", { "f.txt": "0", "g.txt": "0" }, time);

      await commitTree(
        "B",
        {
          "f.txt": "B",
          "h.txt": stripIndent`
        one
        two
        three

      `,
        },
        time
      );

      for (const n of ["C", "D"] as const) {
        await commitTree(
          n,
          {
            "f.txt": n,
            "h.txt": stripIndent`
          ${n}
          two
          three

        `,
          },
          addSeconds(time, 1)
        );
      }

      await t.kitCmd("branch", "topic", "master~2");
      await t.kitCmd("checkout", "topic");

      for (const n of ["E", "F", "G", "H"] as const) {
        await commitTree(
          n,
          {
            "g.txt": n,
            "h.txt": stripIndent`
          one
          two
          ${n}

        `,
          },
          addSeconds(time, 2)
        );
      }

      await t.kitCmd("checkout", "master");
      // TODO: -m オプション
      t.mockStdio("J");
      await t.kitCmd("merge", "topic^");

      await commitTree("K", { "f.txt": "K" }, addSeconds(time, 3));
      // prettier-ignore
      master = await Promise.all([0, 1, 2, 3, 4, 5].map(n => t.resolveRevision(`master~${n}`)));
      // prettier-ignore
      topic = await Promise.all([0, 1, 2, 3].map(n => t.resolveRevision(`topic~${n}`)));
    });

    it("logs concurrent branches leading to a merge", async () => {
      await t.kitCmd("log", "--pretty=oneline");

      t.assertInfo(stripIndent`
        ${master[0]} K
        ${master[1]} J
        ${topic[1]} G
        ${topic[2]} F
        ${topic[3]} E
        ${master[2]} D
        ${master[3]} C
        ${master[4]} B
        ${master[5]} A
      `);
    });

    it("logs the first parent of a merge", async () => {
      await t.kitCmd("log", "--pretty=oneline", "master^^");

      t.assertInfo(stripIndent`
        ${master[2]} D
        ${master[3]} C
        ${master[4]} B
        ${master[5]} A
      `);
    });

    it("logs the second parent of a merge", async () => {
      await t.kitCmd("log", "--pretty=oneline", "master^^2");

      t.assertInfo(stripIndent`
      ${topic[1]} G
      ${topic[2]} F
      ${topic[3]} E
      ${master[4]} B
      ${master[5]} A
      `);
    });

    it("logs unmerged commits on a branch", async () => {
      await t.kitCmd("log", "--pretty=oneline", "master..topic");

      t.assertInfo(stripIndent`
        ${topic[0]} H
      `);
    });

    it("does not show patches for merge commits", async () => {
      await t.kitCmd("log", "--pretty=oneline", "--patch", "topic..master", "^master^^^");

      t.assertInfo(stripIndent`
        ${master[0]} K
        diff --git a/f.txt b/f.txt
        index 02358d2..449e49e 100644
        --- a/f.txt
        +++ b/f.txt
        @@ -1,1 +1,1 @@
        -D
        +K
        ${master[1]} J
        ${master[2]} D
        diff --git a/f.txt b/f.txt
        index 96d80cd..02358d2 100644
        --- a/f.txt
        +++ b/f.txt
        @@ -1,1 +1,1 @@
        -C
        +D
        diff --git a/h.txt b/h.txt
        index 4e5ce14..4139691 100644
        --- a/h.txt
        +++ b/h.txt
        @@ -1,3 +1,3 @@
        -C
        +D
         two
         three
      `);
    });

    it("shows combined patches for merges", async () => {
      await t.kitCmd("log", "--pretty=oneline", "--cc", "topic..master", "^master^^^");

      t.assertInfo(stripIndent`
        ${master[0]} K
        diff --git a/f.txt b/f.txt
        index 02358d2..449e49e 100644
        --- a/f.txt
        +++ b/f.txt
        @@ -1,1 +1,1 @@
        -D
        +K
        ${master[1]} J
        diff --cc h.txt
        index 4139691,f3e97ee..4e78f4f
        --- a/h.txt
        +++ b/h.txt
        @@@ -1,3 -1,3 +1,3 @@@
         -one
         +D
          two
        - three
        + G
        ${master[2]} D
        diff --git a/f.txt b/f.txt
        index 96d80cd..02358d2 100644
        --- a/f.txt
        +++ b/f.txt
        @@ -1,1 +1,1 @@
        -C
        +D
        diff --git a/h.txt b/h.txt
        index 4e5ce14..4139691 100644
        --- a/h.txt
        +++ b/h.txt
        @@ -1,3 +1,3 @@
        -C
        +D
         two
         three
      `);
    });

    it("does not list merges with treesame parents for prune paths", async () => {
      await t.kitCmd("log", "--pretty=oneline", "g.txt");

      t.assertInfo(stripIndent`
        ${topic[1]} G
        ${topic[2]} F
        ${topic[3]} E
        ${master[5]} A
      `);
    });

    describe("with changes that are undone on a branch leading to a merge", () => {
      beforeEach(async () => {
        const time = new Date();
        await t.kitCmd("branch", "aba", "master~4"); // B
        await t.kitCmd("checkout", "aba");

        for (const n of ["C", "0"]) {
          await commitTree(n, { "g.txt": n }, addSeconds(time, 1));
        }
        t.mockStdio("J");
        await t.kitCmd("merge", "topic^");

        await commitTree("K", { "f.txt": "K" }, addSeconds(time, 3));
      });

      it("does not list commits on the filtered branch", async () => {
        await t.kitCmd("log", "--pretty=oneline", "g.txt");

        t.assertInfo(stripIndent`
          ${topic[1]} G
          ${topic[2]} F
          ${topic[3]} E
          ${master[5]} A
        `);
      });
    });
  });
});
