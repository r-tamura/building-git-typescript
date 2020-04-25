import * as path from "path";
import { Database } from "../database";
import { Index } from "../gindex/index";
import { Workspace } from "../workspace";
import { Refs } from "../refs";
import { Pathname } from "../types";
import { Process, FileService } from "../services";
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
  constructor(public gitPath: Pathname, private env: RepositoryEnv) {}

  get database() {
    return (this.#database =
      this.#database ??
      new Database(path.join(this.gitPath, "objects"), this.env));
  }

  get index() {
    return (this.#index =
      this.#index ?? new Index(path.join(this.gitPath, "index"), this.env));
  }

  get refs() {
    return (this.#refs = this.#refs ?? new Refs(this.gitPath, this.env));
  }

  get status() {
    return Status.of(this);
  }

  get workspace() {
    return (this.#workspace =
      this.#workspace ?? new Workspace(path.dirname(this.gitPath), this.env));
  }
}
