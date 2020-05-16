import * as t from "./helper";
import { stripIndent } from "~/util";

describe("diff", () => {
  beforeEach(t.beforeHook);
  afterEach(t.afterHook);

  async function assertDiff(expected: string) {
    await t.jitCmd("diff");
    t.assertInfo(expected);
  }

  describe("workspace/index", () => {
    beforeEach(async () => {
      await t.writeFile("file.txt", "contents");
      await t.jitCmd("add", ".");
    });
    it("コンテンツに変更があるとき、行ごとのpatch diffを表示する", async () => {
      await t.writeFile("file.txt", "changed");

      await assertDiff(stripIndent`
        diff --git a/file.txt b/file.txt
        index 0839b2e..21fb1ec 100644
        --- a/file.txt
        +++ b/file.txt
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
      `);
    });
  });
});
