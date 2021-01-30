import { Reader, Stream } from ".";
import * as database from "../database";
import * as progress from "../progress";

export class Indexer {
  #database: database.Database;
  #reader: Reader;
  #stream: Stream;
  #progress?: progress.Progress;
  constructor(
    database: database.Database,
    reader: Reader,
    stream: Stream,
    progress?: progress.Progress,
  ) {
    this.#database = database;
    this.#reader = reader;
    this.#stream = stream;
    this.#progress = progress;
  }

  async processPack(): Promise<void> {}
}
