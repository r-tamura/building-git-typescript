import * as path from "path";
import { Database } from "../database";
import { Index } from "../gindex/index";
import { Workspace } from "../workspace";
import { Refs } from "../refs";
import { Nullable, OID, Pathname } from "../types";
import { Process, FileService } from "../services";
import { Status } from "./status";
import { Changes } from "../database";
import { Migration } from "./migration";
import { PendingCommit } from "./pending_commit";
import { HardReset } from "./hard_reset";
import { Stack } from "../config";
import { Remotes } from "../remotes";

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
  constructor(public gitPath: Pathname, public env: RepositoryEnv) {}

  get database() {
    return (this.#database ??= new Database(path.join(this.gitPath, "objects"), this.env));
  }

  get index() {
    return (this.#index ??= new Index(path.join(this.gitPath, "index"), this.env));
  }

  get refs() {
    return (this.#refs ??= new Refs(this.gitPath, this.env));
  }

  status(commitOid: Nullable<OID> = null) {
    return Status.of(this, commitOid);
  }

  get workspace() {
    return (this.#workspace ??= new Workspace(path.dirname(this.gitPath), this.env));
  }

  migration(treeDiff: Changes) {
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
}
