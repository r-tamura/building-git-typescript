import * as path from "path"
import { FileService } from "./services"

type Environment = {
  fs: FileService
}

export class Workspace {
  #IGNORE = [".", "..", ".git"]
  #pathname: string
  #fs: FileService

  constructor(pathname: string, env?: Environment) {
    this.#pathname = pathname
    if (env) {
      this.#fs = env.fs
    }
  }

  setFs(fs: FileService) {
    this.#fs = fs
  }

  async listFiles() {
    return this.#fs.readdir(this.#pathname).then(files => files.filter(file => !this.#IGNORE.includes(file)))
  }

  async readFile(rpath: string) {
    return this.#fs.readFile(path.join(this.#pathname, rpath), "ascii")
  }
}