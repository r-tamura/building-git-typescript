import { Changes, Entry, ModeNumber, Blob } from "../database";
import { Repository } from "../repository";
import { Inputs } from "./inputs";
import { first, asserts } from "../util";
import { Pathname, OID } from "../types";

export class Resolve {
  #repo: Repository;
  #inputs: Inputs;
  #leftDiff!: Changes;
  #rightDiff!: Changes;
  /** left(HEAD)とマージ結果の差分。Repository#migrationによりworkspace/indexへ適用される。 */
  #cleanDiff!: Changes;
  #conflicts!: Map<Pathname, [Entry | null, Entry | null, Entry | null]>;
  constructor(repo: Repository, inputs: Inputs) {
    this.#repo = repo;
    this.#inputs = inputs;
  }

  async execute() {
    // コンフリクトの検知とmigrationに必要なdiffの作成
    await this.prepareTreeDiff();

    // const treeDiff = await this.#repo.database.treeDiff(baseOid, this.#inputs.rightOid);
    const migration = this.#repo.migration(this.#cleanDiff);
    await migration.applyChanges();

    // migrationによりindexへstage-0のファイルが追加されてしまうので、それらをコンフリクトitemへ置き換える
    this.addConflictsToIndex();
  }

  /**
   * インデックスへ適用するためのマージブランチとベースブランチのdiffを生成する。
   */
  private async prepareTreeDiff() {
    const baseOid = first(this.#inputs.baseOids);
    this.#leftDiff = await this.#repo.database.treeDiff(baseOid, this.#inputs.leftOid);
    this.#rightDiff = await this.#repo.database.treeDiff(baseOid, this.#inputs.rightOid);
    this.#cleanDiff = new Map();
    this.#conflicts = new Map();

    const promises = [];
    for (const [pathname, [oldItem, newItem]] of this.#rightDiff) {
      promises.push(this.samePathCOnflict(pathname, oldItem, newItem));
    }
    return Promise.all(promises);
  }

  /**
   * 同じパスのitemに対して、コンフリクト条件を満たす変更が行われたかを判定し、結果をcleanDiffへ保存します。
   * @param pathname
   * @param oldItem
   * @param newItem
   */
  private async samePathCOnflict(pathname: Pathname, base: Entry | null, right: Entry | null) {
    /**
     * (1) left diffがない -> コンフリクトがない/baseとleftに差分がない
     * (2) left diffがある -> left === right -> 同じ変更をbaseに対して行った -> コンフリクトがない
     *
     * (3) oid/modeのマージ
     * (4) ワークスペースへマージ結果を適用するためにdiffをストア
     * (5) マージに問題がある -> コンフリクトリストへストア
     */
    // (1)
    if (!this.#leftDiff.has(pathname)) {
      this.#cleanDiff.set(pathname, [base, right]);
      return;
    }

    const left = this.#leftDiff.get(pathname)![1];
    // (2)
    if (right !== null && left?.euqals(right)) {
      return;
    }

    // (3)
    const [oidOk, oid] = await this.mergeBlobs(base?.oid, left?.oid, right?.oid);
    const [modeOk, mode] = await this.mergeModes(base?.mode, left?.mode, right?.mode);

    // (4)
    this.#cleanDiff.set(pathname, [left, new Entry(oid, mode)]);

    // (5)
    if (!oidOk || !modeOk) {
      this.#conflicts.set(pathname, [base, left, right]);
    }
  }

  private merge3<T extends number | string>(
    base: T | undefined,
    left: T | undefined,
    right: T | undefined
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

  private async mergeBlobs(base: OID | undefined, left: OID | undefined, right: OID | undefined) {
    const result = this.merge3(base, left, right);
    if (result) {
      return result;
    }

    // merge3で判定できないとき、leftとrightは両方とも存在する
    const conflictData = await this.mergedData(left!, right!);
    const blob = new Blob(conflictData);
    await this.#repo.database.store(blob);
    // datbase.storeによりoidがセットされる
    return [false, blob.oid!] as const;
  }

  private async mergedData(leftOid: OID, rightOid: OID) {
    const leftBlob = await this.#repo.database.load(leftOid);
    const rightBlob = await this.#repo.database.load(rightOid);

    asserts(leftBlob.type === "blob");
    asserts(rightBlob.type === "blob");
    return [
      "<<<<<<< #{ @inputs.left_name }\n",
      leftBlob.data,
      "=======\n",
      rightBlob.data,
      ">>>>>>> #{ @inputs.right_name }\n",
    ].join("");
  }

  /**
   * ファイルモードのマージ
   * Gitではファイルモードでコンフリクト時はleftの値が自動的に選ばれる
   */
  private async mergeModes(
    base: ModeNumber | undefined,
    left: ModeNumber | undefined,
    right: ModeNumber | undefined
  ) {
    // merge3で判定できないとき、leftとrightは両方とも存在する
    return this.merge3(base, left, right) ?? [false, left!];
  }

  private addConflictsToIndex() {
    for (const [pathname, items] of this.#conflicts) {
      this.#repo.index.addConflictSet(pathname, items);
    }
  }
}
