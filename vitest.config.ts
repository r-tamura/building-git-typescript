import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    server: {
      deps: {
        // CJS パッケージを vite で変換させ、namespace import を callable として扱えるようにする
        inline: ["shlex", "crc-32"],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.mts"],
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
