/** プログレスバー更新頻度間隔の閾値 */
const THROTLLING_THRESHOLD_MILLISEC = 50;
const UNITS = ["B", "KiB", "MiB", "GiB"];
const SCALE = 1024.0;

export class Progress {
  #output: NodeJS.WriteStream;
  #message?: string;
  #total?: number;
  #count = 0;
  #bytes = 0;
  #writeAt = Date.now();
  constructor(output: NodeJS.WriteStream) {
    this.#output = output;
  }

  start(message: string, total?: number): void {
    if (!this.#output.isTTY) {
      return;
    }

    this.#message = message;
    this.#total = total;
    this.#count = 0;
    this.#bytes = 0;
    this.#writeAt = this.getTime();
  }

  tick(bytes = 0): void {
    if (this.#message === undefined) {
      return;
    }

    this.#count += 1;
    this.#bytes = bytes;

    const currentTime = this.getTime();
    if (currentTime < this.#writeAt + THROTLLING_THRESHOLD_MILLISEC) {
      return;
    }
    this.#writeAt = currentTime;

    this.clearLine();
    this.#output.write(this.statusLine());
  }

  stop(): void {
    if (this.#message === undefined) {
      return;
    }
  }

  private clearLine(): void {
    this.#output.write("e[Ge[K");
  }

  private getTime() {
    return Date.now();
  }

  private statusLine(): string {
    let line = `${this.#message}: ${this.formatCount()}`;

    if (this.#bytes > 0) {
      line += `, ${this.formatBytes}`;
    }

    if (this.#count === this.#total) {
      line += ". done.";
    }

    return line;
  }

  private formatCount(): string {
    if (this.#total === undefined) {
      return "(" + this.#count + ")";
    } else {
      const percent =
        this.#total === 0 ? 100 : (100 * this.#count) / this.#total;
      return `${percent} % (${this.#count}/${this.#total})`;
    }
  }

  private formatBytes(): string {
    const power = Math.floor(Math.log2(this.#bytes) / Math.log2(SCALE));
    if (power >= UNITS.length) {
      throw new Error(`the number of power is too large, got ${power}`);
    }
    const scaled = this.#bytes / SCALE ** power;

    return `${scaled.toFixed(2)} (${UNITS[power]})`;
  }
}
