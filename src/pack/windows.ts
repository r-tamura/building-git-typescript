import { Entry } from "./entry";

export class Window {
  /** エントリを保有するウィンドウ */
  #objects: Entry[];
  #offset = 0;
  constructor(size: number) {
    this.#objects = new Array(size).fill(undefined);
  }
}
