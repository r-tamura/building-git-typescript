# core / cli monorepo 化 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: 実行時は superpowers:executing-plans (または subagent-driven-development) を使用しタスクごとに緑を確認しながら進める。

**Goal:** kit (Building Git の TypeScript ポート) を pnpm workspace ベースの 2 パッケージ monorepo (`@kit/core` + `@kit/cli`) に再構成し、Git 内部ロジックと CLI レイヤーの依存を一方向 (cli → core) に明確化する。

**Architecture:**

- `packages/core` — Git 内部 (database / refs / repository / index / pack / remotes / merge / diff 等) と汎用 util (text, fs, array, ...)。`@kit/core` として named export
- `packages/cli` — `command/`, `main.ts`, `bin/kit`, presentation 層 (editor, pager, color, progress)、integ テスト。`@kit/core` を workspace 依存
- `private: true` をどちらにも付与 (publish なし)
- TypeScript project references で型安全なクロスパッケージビルド
- vitest workspace で各 package が `test:unit` を持つ。integ は cli 側に移動

**Tech Stack:** pnpm workspaces / TypeScript project references / vitest projects / oxfmt / oxlint / mise (node 25)

**設計判断 (確定済み)**

- 公開戦略: private のみ (両 package に `"private": true`)
- 表示層 (editor / pager / color / progress): cli へ
- integ test: `packages/cli/integ/` へ移動

---

## 事前準備

### Task 0: 現状ベースライン確認 + ブランチ切り

**Step 1: 全 green を確認**

```
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --project tsconfig.prod.json
pnpm test:unit
pnpm test:integ
pnpm lint
pnpm format:check
```

すべて 0 error / 0 warning であること。

**Step 2: ブランチを切る**

```
git switch -c refactor/monorepo-split
```

**Step 3: プランをリポジトリに保存**

`docs/plans/2026-05-01-monorepo-core-cli-split.md` にこの plan の内容をコピーして保存しコミット (執行ログとしての価値)。`mkdir -p docs/plans` を最初に。

---

## Phase A: workspace 骨格を立てる (まだコードは動かさない)

ここまでは既存 `src/` には触れない。green を保ったまま workspace 構造だけ用意する。

### Task A1: pnpm-workspace.yaml 作成

**Files:** Create `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
```

**Step 1: ファイル作成**
**Step 2: `pnpm install` 実行 → 「No projects matched」エラーが出るが想定内 (まだ packages/ が空)**
**Step 3: コミット**

```
git add pnpm-workspace.yaml
git commit -m "chore: pnpm workspace 化の足場 (packages/* 認識)"
```

### Task A2: 空の packages/core / packages/cli を作る

**Files:** Create `packages/core/package.json` `packages/cli/package.json`

```json
// packages/core/package.json
{
  "name": "@kit/core",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.prod.json",
    "build:dev": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --project unit"
  },
  "exports": {
    "./*": {
      "types": "./dist/*.d.ts",
      "default": "./dist/*.js"
    },
    "./*.js": {
      "types": "./dist/*.d.ts",
      "default": "./dist/*.js"
    }
  }
}
```

**barrel export しない方針**: top-level `index.ts` で再 export を集約せず、`exports` フィールドのワイルドカード `"./*"` で各サブモジュールを直接公開する。cli からは `from "@kit/core/database"`, `from "@kit/core/refs"`, `from "@kit/core/util/array"` のように **必要な module を直接** import する。理由は tree-shaking / 循環依存リスク / build 速度。`packages/core/src/database/index.ts` のような **既存のサブディレクトリ barrel** はそのまま残してもよい (それぞれのスコープを内部で集約する用途なので問題は小さい)。新たにルート barrel を増やさないのがポイント。

```json
// packages/cli/package.json
{
  "name": "@kit/cli",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/main.js",
  "bin": {
    "kit": "./bin/kit"
  },
  "scripts": {
    "build": "tsc -p tsconfig.prod.json",
    "build:dev": "tsc -p tsconfig.json --noEmit",
    "test:unit": "vitest run --project unit",
    "test:integ": "vitest run --project integ"
  },
  "dependencies": {
    "@kit/core": "workspace:*"
  }
}
```

**Step 1: 上記 2 ファイルを作成**
**Step 2: `pnpm install` で workspace 認識を確認 (`@kit/core` と `@kit/cli` が `pnpm ls -r --depth -1` に出る)**
**Step 3: コミット**

```
git add packages/
git commit -m "chore: 空の @kit/core と @kit/cli を作成"
```

---

## Phase B: ファイル移動 (大規模・原子的変更)

ここは中間状態が確実に red になる。各ファイル移動 → import 書き換え → tsconfig 整備までを **1 つの大きなコミット** で行うのが現実的。途中段階でも整合性が取れている細切れには分けにくい。

検証は最後にまとめて。コミット粒度として下の Task B1〜B6 は **作業順** だが、実際のコミットは B6 終了時にまとめて 1 つ ("refactor: src/ を packages/{core,cli} に分離"))。

### Task B1: core 側ファイル移動

**Step 1: ターゲットディレクトリ作成**

```
mkdir -p packages/core/src
```

**Step 2: git mv (ディレクトリ単位)**

```
git mv src/database     packages/core/src/database
git mv src/repository   packages/core/src/repository
git mv src/gindex       packages/core/src/gindex
git mv src/pack         packages/core/src/pack
git mv src/remotes      packages/core/src/remotes
git mv src/merge        packages/core/src/merge
git mv src/diff         packages/core/src/diff
git mv src/config       packages/core/src/config
git mv src/services     packages/core/src/services
git mv src/util         packages/core/src/util
git mv src/__test__     packages/core/src/__test__
```

**Step 3: git mv (ファイル単位 — Git 内部ロジック)**

```
git mv src/refs.ts          packages/core/src/refs.ts
git mv src/refs.test.ts     packages/core/src/refs.test.ts
git mv src/revision.ts      packages/core/src/revision.ts
git mv src/revision.test.ts packages/core/src/revision.test.ts
git mv src/rev_list.ts      packages/core/src/rev_list.ts
git mv src/workspace.ts     packages/core/src/workspace.ts
git mv src/workspace.test.ts packages/core/src/workspace.test.ts
git mv src/lockfile.ts      packages/core/src/lockfile.ts
git mv src/lockfile.test.ts packages/core/src/lockfile.test.ts
git mv src/tempfile.ts      packages/core/src/tempfile.ts
git mv src/tempfile.test.ts packages/core/src/tempfile.test.ts
git mv src/path_filter.ts   packages/core/src/path_filter.ts
git mv src/entry.ts         packages/core/src/entry.ts
git mv src/entry.test.ts    packages/core/src/entry.test.ts
git mv src/types.ts         packages/core/src/types.ts
```

### Task B2: cli 側ファイル移動

**Step 1: ターゲット作成**

```
mkdir -p packages/cli/src packages/cli/bin packages/cli/integ
```

**Step 2: git mv (ディレクトリ・ファイル)**

```
git mv src/command       packages/cli/src/command
git mv src/main.ts       packages/cli/src/main.ts
git mv src/editor.ts     packages/cli/src/editor.ts
git mv src/pager.ts      packages/cli/src/pager.ts
git mv src/color.ts      packages/cli/src/color.ts
git mv src/progress.ts   packages/cli/src/progress.ts
git mv bin/kit           packages/cli/bin/kit
git mv integ             packages/cli/integ
```

**Step 3: 旧ディレクトリ削除確認**

```
rmdir src bin     # 失敗したらまだ未移動のファイルがある → 確認して対処
```

### Task B3: core 側はサブディレクトリ単位の既存 index.ts を維持 (top-level barrel は作らない)

**新規ファイル無し**。`packages/core/package.json` の `exports` ワイルドカード (`"./*": ...`) によって core の各サブモジュールが直接公開されるので、top-level の `packages/core/src/index.ts` は **作らない**。理由:

- top-level barrel は tree-shaking が効きにくく、bundler / tsc / vitest の解決コストが累積しがち
- 全 subpath を 1 ファイルから引くスタイルは循環依存を引き寄せやすい
- 必要なものを必要な場所から引く方が、依存関係も import コストも明示的になる

**確認だけ**: `packages/core/src/database/index.ts` 等の **サブディレクトリ単位の既存 barrel** は、各ドメイン内部の集約として残してよい (kit はもともと `import * as Database from "../database"` のスタイルが多いので、各サブディレクトリの index.ts はそのまま使う)。

### Task B4: cli 側 import パスを書き換え (`@kit/core/<subpath>` 直接指定)

`packages/cli/src/` 配下の `.ts` ファイルで、相対 import が core 側を指している箇所を `@kit/core/<subpath>` ベースに変更する。**top-level の `from "@kit/core"` は使わない**。

**書き換えパターン例**:

| Before (相対)                              | After (subpath)                                   |
| ------------------------------------------ | ------------------------------------------------- |
| `import * as Database from "../database"`  | `import * as Database from "@kit/core/database"`  |
| `import { OID, Pathname } from "../types"` | `import { OID, Pathname } from "@kit/core/types"` |
| `import { asserts } from "../util/assert"` | `import { asserts } from "@kit/core/util/assert"` |
| `import { Workspace } from "../workspace"` | `import { Workspace } from "@kit/core/workspace"` |
| `import * as refs from "../refs"`          | `import * as refs from "@kit/core/refs"`          |
| `import { Lockfile } from "../lockfile"`   | `import { Lockfile } from "@kit/core/lockfile"`   |

**Step 1**: cli 側の cross-package import を grep で洗い出す

```
grep -rn "from \"\\.\\.\\?/" packages/cli/src/ | grep -v "from \"\\./" | grep -v "from \"@kit"
```

**Step 2**: 出力を見て **subpath ごとに sed 一括置換** する。例 (各置換は確認のうえで実行):

```
# database
grep -rl 'from "\.\./database"' packages/cli/src/ | \
  xargs sed -i '' 's|from "\.\./database"|from "@kit/core/database"|g'

# types
grep -rl 'from "\.\./types"' packages/cli/src/ | \
  xargs sed -i '' 's|from "\.\./types"|from "@kit/core/types"|g'

# util/assert
grep -rl 'from "\.\./util/assert"' packages/cli/src/ | \
  xargs sed -i '' 's|from "\.\./util/assert"|from "@kit/core/util/assert"|g'

# (以下、Step 1 で見つかった各 subpath について繰り返す)
```

**Step 3**: `packages/cli/src/main.ts` `packages/cli/src/editor.ts` `packages/cli/src/command/shared/*.ts` 等で **`./command` や `./services`** が混在している場合、command は cli 内なので相対のまま、services は core 側なので `@kit/core/services` に変える、と振り分ける。

**Step 4**: 書き換え後、`grep -rn 'from "\\.\\./' packages/cli/src/ | grep -v 'from "\\./'` で残存ゼロを確認。

### Task B5: tsconfig 整備

**Files:** Create / Modify

```jsonc
// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
  },
  "include": ["src/**/*.ts"],
}
```

```jsonc
// packages/core/tsconfig.prod.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "noEmit": false,
    "rewriteRelativeImportExtensions": true,
  },
  "exclude": ["src/**/*.test.ts", "src/**/*.test.mts", "src/__test__/**"],
}
```

```jsonc
// packages/cli/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
  },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../core" }],
}
```

```jsonc
// packages/cli/tsconfig.prod.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "noEmit": false,
    "rewriteRelativeImportExtensions": true,
  },
  "exclude": ["src/**/*.test.ts", "src/__test__/**"],
  "references": [{ "path": "../core/tsconfig.prod.json" }],
}
```

**ルート tsconfig.base.json** (新規。共通 compilerOptions)

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "CommonJS",
    "noEmit": true,
    "strict": true,
    "allowImportingTsExtensions": true,
    "lib": ["ES2024"],
    "types": ["node", "vitest/globals"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
  },
}
```

**ルート tsconfig.json** (references のみ)

```jsonc
{
  "files": [],
  "references": [{ "path": "./packages/core" }, { "path": "./packages/cli" }],
}
```

旧 `tsconfig.prod.json` はルートから削除。

### Task B6: vitest 設定整備

**ルート vitest.config.ts** を簡素化、各パッケージに自前 config を持たせる。

```ts
// packages/core/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    server: { deps: { inline: ["crc-32"] } },
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
```

```ts
// packages/cli/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    projects: [
      { extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      {
        extends: true,
        test: {
          name: "integ",
          include: ["integ/**/*.test.ts"],
          testTimeout: 30_000,
          pool: "forks",
        },
      },
    ],
  },
});
```

ルートの `vitest.config.ts` は削除し、ルート `package.json` の test scripts を `pnpm -r --parallel run test*` 系に置き換え:

```jsonc
"scripts": {
  "build:release": "pnpm -r run build",
  "build:dev": "tsc -b",
  "test:unit": "pnpm -r run test:unit || pnpm -r run test",
  "test:integ": "pnpm --filter @kit/cli run test:integ",
  "test:all": "pnpm test:unit && pnpm test:integ",
  "lint": "oxlint",
  "format": "oxfmt .",
  "format:check": "oxfmt --check ."
}
```

### Task B7: bin/kit の shim を整備

`packages/cli/bin/kit` の `require("../dist/main")` パスはそのまま動くはず (`packages/cli/dist/main.js` が build 後に出力されるため)。動作確認は Phase C で。

ルート直下からも `kit` が叩けるよう、ルートの `package.json` から `"bin"` を取り除き、代わりに `pnpm --filter @kit/cli exec` で叩く方針に統一。または symlink shim を後で検討。

**ここまでで Phase B の作業完了。コミットを 1 つにまとめる:**

```
git add -A
git commit -m "refactor: src/ を packages/{core,cli} に分離"
```

---

## Phase C: 検証

### Task C1: 型チェック

```
pnpm -r run build:dev    # 各 package で tsc --noEmit
pnpm -r run build        # 各 package で prod build (declaration emit)
```

エラーが出たら Phase B の import / tsconfig まで遡って修正。ありがちな失敗:

- `@kit/core/<subpath>` の subpath が `exports` のパターンとマッチしない → core の `package.json` の `exports` を見直し (拡張子なしと `.js` 付きの両方に対応しているか)
- core 側で `import { X } from "../../types"` のような上位を指す相対が残っている → `from "../types"` 等に直す
- `composite: true` を入れた core で `outDir` 必須エラー → tsconfig 確認

### Task C2: テスト

```
pnpm test:unit
pnpm test:integ
pnpm lint
pnpm format:check
```

integ テストは `packages/cli/integ/command/helper.ts` の `bin/kit` 起動経路が変わっている可能性があるので、`kitPath()` 等のユーティリティを grep して新しいパス (`packages/cli/bin/kit` または `packages/cli/dist/main.js`) に追従させる。

### Task C3: スモーク

```
pnpm --filter @kit/cli exec node bin/kit init /tmp/kit-smoke
cd /tmp/kit-smoke && pnpm --filter @kit/cli -C $OLDPWD exec node bin/kit add . && \
  pnpm --filter @kit/cli -C $OLDPWD exec node bin/kit commit -m "smoke"
```

(コマンド形は実際のリポジトリ構成に合わせて微調整)

### Task C4: CI 設定の見直し

`.github/workflows/ci.yml` の steps:

- `pnpm install --frozen-lockfile` はそのままで OK (pnpm が workspace を認識する)
- `pnpm lint` `pnpm format:check` はそのままで OK (ルートで実行)
- `pnpm test:unit` `pnpm test:integ` はルート script を新形式 (`pnpm -r run …`) に変えれば動く
- `pretest:integ: "pnpm build:release"` も新 script に追従しているか確認

CI を後回しにせず Phase C 内で更新し、push 前に手元の `pnpm test:all` がフルで通ることを保証する。

---

## Phase D: push と PR

### Task D1: push + PR 作成

```
git push -u origin refactor/monorepo-split
gh pr create --title "refactor: pnpm workspace で @kit/core と @kit/cli に分離" \
             --body-file docs/plans/2026-05-01-monorepo-core-cli-split.md
```

PR 本文はこのプランをそのまま貼ると review しやすい。最終的な dependency 図と動作確認手順を Summary に追記。

CI green 確認 → ユーザーから merge 指示を受けて squash merge。

---

## 重要な注意

- **Phase B は途中状態が必ず red になる**。1 commit にまとめて構造的整合性を保つ
- **integ テストの bin/kit 起動経路** は `packages/cli/integ/command/helper.ts` の中で必ず引っかかる。Phase C で必ず確認
- **vitest server.deps.inline** に `"crc-32"` を core 側に移すのを忘れない
- **`composite: true`** を core に入れると `tsc --build` のキャッシュが効くが、`tsc --noEmit` だけ走るとうるさいことがある。Phase C で挙動確認
- **DO NOT** 元の `tsconfig.json` `tsconfig.prod.json` `vitest.config.ts` をルート直下に残す。残すと build target が二重化する
- **commit は Phase ごと** (A1, A2, B6, C2 後 fix, C4 後 fix の最低 5 commits)。途中 squash で整理してから push

## 実装中に必要になりそうな grep / 確認コマンド

```
# core 公開 API 候補 (cli から呼ばれる core 由来 import)
grep -rn "from \"@kit/core" packages/cli/src/ | sort -u

# 残存する src/ 参照 (移動忘れ検出)
grep -rn "from \"\\.\\./\\.\\./\\.\\./src\\|from \"src/" packages/

# 旧ルート tsconfig 残骸
ls tsconfig.json tsconfig.prod.json 2>/dev/null
```
