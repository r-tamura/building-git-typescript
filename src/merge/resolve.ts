import * as path from "path";
import { Blob, ChangeMap, Entry } from "../database";
import { ModeNumber } from "../entry";
import { Repository } from "../repository";
import { OID, Pathname } from "../types";
import { ascend, asserts, first } from "../util";
import { Diff3 } from "./diff3";
import { CherryPick, Inputs } from "./inputs";

export type Conflict = readonly [Entry | null, Entry | null, Entry | null];
type OnProgress = (message: string) => void;

/**
 * Resolveクラスで解決可能なインタフェースを持つ入力データ
 */
export type Resolvable = Inputs | CherryPick;
export class Resolve {
  #repo: Repository;
  #inputs: Resolvable;
  #leftDiff!: ChangeMap;
  #rightDiff!: ChangeMap;
  /** left(HEAD)とマージ結果の差分。Repository#migrationによりworkspace/indexへ適用される。 */
  #cleanDiff!: ChangeMap;
  #conflicts!: Map<Pathname, Conflict>;
  #untracked!: Map<Pathname, Entry>;
  onprogress: OnProgress | null = null;
  constructor(repo: Repository, inputs: Resolvable) {
    this.#repo = repo;
    this.#inputs = inputs;
  }

  async execute() {
    // コンフリクトの検知とmigrationに必要なdiffの作成
    await this.prepareTreeDiff();

    const migration = this.#repo.migration(this.#cleanDiff);
    await migration.applyChanges();

    // migrationによりindexへstage-0のファイルが追加されてしまうので、それらをコンフリクトitemへ置き換える
    this.addConflictsToIndex();

    //　file/directoryコンフリクト時に、file側を「file名~ブランチ名」としてworkspaceへ書き出す
    await this.wirteUntrackedFiles();
  }

  /**
   * インデックスへ適用するためのマージブランチとベースブランチのdiffを生成する。
   */
  private async prepareTreeDiff() {
    const baseOid = first(this.#inputs.baseOids);
    this.#leftDiff = await this.#repo.database.treeDiff(
      baseOid,
      this.#inputs.leftOid,
    );
    this.#rightDiff = await this.#repo.database.treeDiff(
      baseOid,
      this.#inputs.rightOid,
    );
    this.#cleanDiff = new Map();
    this.#conflicts = new Map();
    this.#untracked = new Map();

    for (const [pathname, [oldItem, newItem]] of this.#rightDiff) {
      await this.samePathCOnflict(pathname, oldItem, newItem);
      if (newItem) {
        this.fileDirConflict(pathname, this.#leftDiff, this.#inputs.leftName);
      }
    }

    for (const [pathname, [_, newItem]] of this.#leftDiff) {
      if (newItem) {
        this.fileDirConflict(pathname, this.#rightDiff, this.#inputs.rightName);
      }
    }
  }

  /**
   * 同じパスのitemに対して、コンフリクト条件を満たす変更が行われたかを判定し、結果をcleanDiffへ保存します。
   * @param pathname
   * @param oldItem
   * @param newItem
   */
  private async samePathCOnflict(
    pathname: Pathname,
    base: Entry | null,
    right: Entry | null,
  ) {
    /**
     * (0) 親ディレクトリでコンフリクトがない(ある場合はfileDirConflictで判定される)
     * (1) left diffがない -> コンフリクトがない/baseとleftに差分がない
     * (2) left diffがある -> left === right -> 同じ変更をbaseに対して行った or 両削除  -> コンフリクトがない
     *
     * (3) oid/modeのマージ
     * (4) ワークスペースへマージ結果を適用するためにdiffをストア
     * (5) マージに問題がある -> コンフリクトリストへストア
     */
    // (0)
    // Note: 本文中には記載がない
    if (this.#conflicts.get(pathname)) {
      return;
    }

    // (1)
    if (!this.#leftDiff.has(pathname)) {
      this.#cleanDiff.set(pathname, [base, right]);
      return;
    }

    const left = this.#leftDiff.get(pathname)![1];
    // (2)
    const areBothDeleted = left === right;
    const areBothChangedSameWay = right !== null && left?.euqals(right);
    if (areBothDeleted || areBothChangedSameWay) {
      return;
    }

    if (left && right) {
      this.log(`Auto-merging ${pathname}`);
    }

    // (3)
    const [oidOk, oid] = await this.mergeBlobs(
      base?.oid,
      left?.oid,
      right?.oid,
    );
    const [modeOk, mode] = await this.mergeModes(
      base?.mode,
      left?.mode,
      right?.mode,
    );

    // (4)
    this.#cleanDiff.set(pathname, [left, new Entry(oid, mode)]);

    // (5)
    if (oidOk && modeOk) {
      return;
    }
    this.#conflicts.set(pathname, [base, left, right]);
    this.logConflict(pathname);
  }

  private merge3<T extends number | string>(
    base: T | undefined,
    left: T | undefined,
    right: T | undefined,
  ): [boolean, T] | null {
    // left:削除 right:変更
    if (!left) {
      asserts(typeof right !== "undefined", "leftがないとき、rightが存在する");
      return [false, right];
    }

    // left:変更 right:削除
    if (!right) {
      return [false, left];
    }

    if (left === base || left === right) {
      // left === base  -> rightしか変更されてないのでrightを正とする
      // left === right -> どちらを正としても良い
      return [true, right];
    } else if (right === base) {
      // right === base -> leftしか変更されていないのでleftを正とする
      return [true, left];
    }

    // マージ可否をこの関数では判定できない
    return null;
  }

  private async mergeBlobs(
    base: OID | undefined,
    left: OID | undefined,
    right: OID | undefined,
  ) {
    const result = this.merge3(base, left, right);
    if (result) {
      return result;
    }

    const oids = [base, left, right] as const;
    const blobs = await Promise.all(
      oids.map(async (oid) =>
        oid
          ? ((await this.#repo.database.load(oid)) as Blob).data.toString(
              "utf8",
            )
          : "",
      ),
    );

    const merge = Diff3.merge(blobs[0], blobs[1], blobs[2]);

    // merge3で判定できないとき、leftとrightは両方とも存在する

    // const conflictData = await this.mergedData(left!, right!);
    const data = merge.toString(this.#inputs.leftName, this.#inputs.rightName);
    const blob = new Blob(data);
    await this.#repo.database.store(blob);
    // datbase.storeによりoidがセットされる
    return [merge.clean(), blob.oid!] as const;
  }

  /**
   * ファイルモードのマージ
   * Gitではファイルモードでコンフリクト時はleftの値が自動的に選ばれる
   */
  private async mergeModes(
    base: ModeNumber | undefined,
    left: ModeNumber | undefined,
    right: ModeNumber | undefined,
  ) {
    // merge3で判定できないとき、leftとrightは両方とも存在する
    return this.merge3(base, left, right) ?? [false, left!];
  }

  private addConflictsToIndex() {
    for (const [pathname, items] of this.#conflicts) {
      this.#repo.index.addConflictSet(pathname, items);
    }
  }

  /**
   * 指定されたパスに対してfile/directoryコンフリクトであるかを判定します
   */
  private fileDirConflict(
    pathname: Pathname,
    diff: ChangeMap,
    branchName: string,
  ) {
    for (const parent of ascend(path.dirname(pathname))) {
      const [oldItem, newItem] = diff.get(parent) ?? [null, null];
      if (!newItem) {
        return;
      }

      let conflict: Conflict;
      switch (branchName) {
        case this.#inputs.leftName:
          conflict = [oldItem, newItem, null] as const;
          break;
        case this.#inputs.rightName:
          conflict = [oldItem, null, newItem] as const;
          break;
        default:
          throw new Error(`invalid branch name: '${branchName}'`);
      }
      this.#conflicts.set(parent, conflict);

      this.#cleanDiff.delete(parent);
      const rename = `${parent}~${branchName}`;
      this.#untracked.set(rename, newItem);

      if (!diff.get(pathname)) {
        this.log(`Adding ${pathname}`);
      }
      this.logConflict(parent, rename);
    }
  }

  private log(message: string) {
    this.onprogress?.(message);
  }

  private logConflict(pathname: Pathname, rename?: Pathname) {
    // コンフリクトが発生したパスのみこの関数が呼び出される
    asserts(
      this.#conflicts.get(pathname) !== undefined,
      `${pathname}上のコンフリクトが存在する`,
    );
    const [base, left, right] = this.#conflicts.get(pathname)!;

    if (left && right) {
      this.logLeftRightConflict(pathname);
    } else if (base && (left || right)) {
      this.logModifyDeleteConflict(pathname, rename);
    } else {
      this.logFileDirectoryConflict(pathname, rename);
    }
  }

  private logLeftRightConflict(pathname: Pathname) {
    const type = this.#conflicts.get(pathname)![0] ? "content" : "add/add";
    this.log(`CONFLICT (${type}): Merge conflict in ${pathname}`);
  }

  private logModifyDeleteConflict(pathname: Pathname, rename?: Pathname) {
    const [deleted, modified] = this.logBranchNames(pathname);
    rename = rename ? ` at ${rename}` : "";

    this.log(
      `CONFLICT (modify/delete): ${pathname}` +
        ` deleted in ${deleted} and modified in ${modified}.` +
        ` Version ${modified} of ${pathname} left in tree${rename}.`,
    );
  }

  private logBranchNames(pathname: Pathname) {
    const [a, b] = [this.#inputs.leftName, this.#inputs.rightName];
    return this.#conflicts.get(pathname)![1] ? [b, a] : [a, b];
  }

  private logFileDirectoryConflict(pathname: Pathname, rename?: Pathname) {
    const type = this.#conflicts.get(pathname)![1]
      ? "file/directory"
      : "directory/file";
    const [branch, _] = this.logBranchNames(pathname);
    this.log(
      `CONFLICT (${type}): There is a directory` +
        ` with name ${pathname} in ${branch}.` +
        ` Adding ${pathname} as ${rename}`,
    );
  }

  private async wirteUntrackedFiles() {
    for (const [pathname, item] of this.#untracked) {
      // blobオブジェクトの読み込み
      const blob = (await this.#repo.database.load(item.oid)) as Blob;
      await this.#repo.workspace.writeFile(pathname, blob.data);
    }
  }
}
