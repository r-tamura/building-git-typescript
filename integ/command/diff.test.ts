import * as T from "./helper";
import { stripIndent } from "~/util";
import { Repository } from "~/repository";

const t = T.create();

describe("diff", () => {
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  async function assertDiff(expected: string) {
    await t.kitCmd("diff");
    t.assertInfo(expected);
  }

  async function assertDiffHeadIndex(expected: string) {
    await t.kitCmd("diff", "--cached");
    t.assertInfo(expected);
  }

  describe("index/workspace", () => {
    beforeEach(async () => {
      await t.writeFile("file.txt", "contents");
      await t.kitCmd("add", ".");
    });
    it("コンテンツに変更があるとき、行ごとのpatch diffを表示する", async () => {
      new Repository("", {} as any);
      await t.writeFile("file.txt", "changed");

      await assertDiff(stripIndent`
        diff --git a/file.txt b/file.txt
        index 0839b2e..21fb1ec 100644
        --- a/file.txt
        +++ b/file.txt
        @@ -1,1 +1,1 @@
        -contents
        +changed
      `);
    });

    it("ファイルモードに変換があるとき、モードのdiffを表示する", async () => {
      await t.makeExecutable("file.txt");

      await assertDiff(stripIndent`
        diff --git a/file.txt b/file.txt
        old mode 100644
        new mode 100755
      `);
    });

    it("コンテンツ・ファイルモードに変換があるとき、コンテンツ・モードのdiffを表示する", async () => {
      await t.writeFile("file.txt", "changed");
      await t.makeExecutable("file.txt");

      await assertDiff(stripIndent`
        diff --git a/file.txt b/file.txt
        old mode 100644
        new mode 100755
        index 0839b2e..21fb1ec
        --- a/file.txt
        +++ b/file.txt
        @@ -1,1 +1,1 @@
        -contents
        +changed
      `);
    });

    it("ファイルが削除されたとき、削除のdiffを表示する", async () => {
      await t.rm("file.txt");

      await assertDiff(stripIndent`
        diff --git a/file.txt b/file.txt
        deleted file mode 100644
        index 0839b2e..0000000
        --- a/file.txt
        +++ /dev/null
        @@ -1,1 +0,0 @@
        -contents
      `);
    });

    it("'--no-patch'オプションが指定されたとき、patch情報を出力しない", async () => {
      await t.writeFile("file.txt", "changed");

      await t.kitCmd("diff", "--no-patch");

      t.assertInfo("");
    });
  });

  describe("head/index", () => {
    beforeEach(async () => {
      await t.writeFile("file.txt", "contents");
      await t.kitCmd("add", ".");
      await t.commit("first commit");
    });

    it("コンテンツに変更があるとき、行ごとのpatch diffを表示する", async () => {
      await t.writeFile("file.txt", "changed");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");

      await assertDiffHeadIndex(stripIndent`
        diff --git a/file.txt b/file.txt
        index 0839b2e..21fb1ec 100644
        --- a/file.txt
        +++ b/file.txt
        @@ -1,1 +1,1 @@
        -contents
        +changed
      `);
    });

    it("新しいファイルがindexへ追加されたとき、new fileとして表示する", async () => {
      await t.writeFile("new.txt", "new");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");

      await assertDiffHeadIndex(stripIndent`
        diff --git a/new.txt b/new.txt
        new file mode 100644
        index 0000000..3e5126c
        --- /dev/null
        +++ b/new.txt
        @@ -0,0 +1,1 @@
        +new
      `);
    });

    it("ファイルが削除されたとき、削除されたファイルを表示する", async () => {
      await t.rm("file.txt");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");

      await assertDiffHeadIndex(stripIndent`
        diff --git a/file.txt b/file.txt
        deleted file mode 100644
        index 0839b2e..0000000
        --- a/file.txt
        +++ /dev/null
        @@ -1,1 +0,0 @@
        -contents
      `);
    });

    it("'--no-patch'オプションが指定されたとき、patch情報を出力しない", async () => {
      await t.writeFile("file.txt", "changed");
      await t.rm(".git/index");
      await t.kitCmd("add", ".");

      await t.kitCmd("diff", "--cached", "--no-patch");

      t.assertInfo("");
    });
  });
});
