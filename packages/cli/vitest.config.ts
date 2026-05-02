import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // テスト時は @kit/core/* を src のソースに直接解決させる。
      // これにより dist (CJS) と src (TS) が二重ロードされて
      // instanceof / constructor 比較が失敗する問題を回避する。
      // 例: @kit/core/util/array → packages/core/src/util/array.ts
      //     @kit/core/database  → packages/core/src/database/index.ts
      {
        find: /^@kit\/core\/(.+)$/,
        replacement: path.resolve(__dirname, "../core/src") + "/$1",
      },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integ",
          include: ["integ/**/*.test.ts"],
          testTimeout: 30_000,
          // 統合テストはサブプロセス起動とファイルシステム共有があるため
          // worker thread でなく forks (プロセス分離) で安定させる
          pool: "forks",
        },
      },
    ],
  },
});
