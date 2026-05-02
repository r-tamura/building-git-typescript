import * as path from "node:path";
import { Stack } from "../config/index.js";
import type { ChangeMap } from "../database/index.js";
import { Database } from "../database/index.js";
import { Index } from "../gindex/index.js";
import type { SymRef } from "../refs.js";
import { Refs } from "../refs.js";
import { Remotes } from "../remotes/index.js";
import type { FileService, Process } from "../services/index.js";
import type { Nullable, OID, Pathname } from "../types.js";
import type { PosixPath } from "../util/fs.js";
import { posixJoin, posixPath } from "../util/fs.js";
import { Workspace } from "../workspace.js";
import { Divergence } from "./divergence.js";
import { HardReset } from "./hard_reset.js";
import { Migration } from "./migration.js";
import { PendingCommit } from "./pending_commit.js";
import { Status } from "./status.js";

export type RepositoryEnv = {
  process: Process;
  fs: FileService;
  date: {
    now(): Date;
  };
};

export class Repository {
  #database!: Database;
  #index!: Index;
  #workspace!: Workspace;
  #refs!: Refs;
  #config!: Stack;
  #remotes!: Remotes;
  gitPath: PosixPath;
  env: RepositoryEnv;
  constructor(gitPath: Pathname, env: RepositoryEnv) {
    this.gitPath = posixPath(gitPath);
    this.env = env;
  }
  get database() {
    return (this.#database ??= new Database(
      posixJoin(this.gitPath, "objects"),
      this.env,
    ));
  }
  get index() {
    return (this.#index ??= new Index(
      posixJoin(this.gitPath, "index"),
      this.env,
    ));
  }

  get refs() {
    return (this.#refs ??= new Refs(this.gitPath, this.env));
  }

  status(commitOid: Nullable<OID> = null) {
    return Status.of(this, commitOid);
  }
  get workspace() {
    return (this.#workspace ??= new Workspace(
      path.posix.dirname(this.gitPath),
      this.env,
    ));
  }

  migration(treeDiff: ChangeMap) {
    return new Migration(this, treeDiff);
  }

  async hardReset(oid: OID) {
    return new HardReset(this, oid).execute();
  }

  pendingCommit() {
    return new PendingCommit(this.gitPath, this.env);
  }

  get config() {
    return (this.#config ??= new Stack(this.gitPath));
  }

  get remotes() {
    return (this.#remotes ??= new Remotes(this.config.file("local")));
  }

  async divergence(ref: SymRef): Promise<Divergence | undefined> {
    return await Divergence.of(this, ref);
  }
}
