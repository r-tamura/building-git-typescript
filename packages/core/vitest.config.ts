import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // 一貫性のため core 側でも @kit/core/* を src に解決させる。
      {
        find: /^@kit\/core\/(.+)$/,
        replacement: path.resolve(__dirname, "src") + "/$1",
      },
    ],
  },
  test: {
    server: {
      deps: {
        // CJS パッケージを vite で変換させ、namespace import を callable として扱えるようにする
        inline: ["crc-32"],
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
    ],
  },
});
