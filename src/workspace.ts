import * as path from "path"
import { FileService, defaultFs } from "./services"

type Environment = {
  fs?: FileService
}

export class Workspace {
  #IGNORE = [".", "..", ".git"]
  #pathname: string
  #fs: FileService

  constructor(pathname: string, env: Environment = {}) {
    this.#pathname = pathname
    this.#fs = env.fs ?? defaultFs
  }

  setFs(fs: FileService) {
    this.#fs = fs
  }

  async listFiles() {
    return this.#fs.readdir(this.#pathname).then(files => files.filter(file => !this.#IGNORE.includes(file)))
  }

  async readFile(rpath: string) {
    return this.#fs.readFile(this.join(rpath), "ascii")
  }

  async statFile(rpath: string) {
    return this.#fs.stat(this.join(rpath))
  }

  private join(rpath: string) {
    return path.join(this.#pathname, rpath)
  }
}