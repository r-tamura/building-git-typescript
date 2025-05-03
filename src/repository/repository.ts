import * as path from "path";
import { Stack } from "../config";
import { ChangeMap, Database } from "../database";
import { Index } from "../gindex/index";
import { Refs, SymRef } from "../refs";
import { Remotes } from "../remotes";
import { FileService, Process } from "../services";
import { Nullable, OID, Pathname } from "../types";
import { posixJoin, PosixPath, posixPath } from "../util/fs";
import { Workspace } from "../workspace";
import { Divergence } from "./divergence";
import { HardReset } from "./hard_reset";
import { Migration } from "./migration";
import { PendingCommit } from "./pending_commit";
import { Status } from "./status";

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
    const gitPath = this.gitPath;
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
