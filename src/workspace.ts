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

  async listFiles(dir: string = this.#pathname): Promise<string[]> {
    const names = await this.#fs.readdir(dir)
      .then(names => names.filter(name => !this.#IGNORE.includes(name)))

    // TODO: flatMapで置き換えられないか?
    const promises: Promise<string[] | string>[] = names.map(async (name) => {
      const fullpath = path.join(dir, name)
      const stats = await this.#fs.stat(fullpath)
      if (stats.isDirectory()) {
        const names = await this.listFiles(fullpath)
        return names
      }
      return path.relative(this.#pathname, fullpath)
    })
    const all = await Promise.all(promises)
    return all.flat()
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