import { FileService } from "./services/FileService"

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
}