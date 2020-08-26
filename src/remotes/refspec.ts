export class Refspec {
  constructor(public source: string, public target: string, public forced: boolean) {}

  toString() {
    const spec = this.forced ? "+" : "";
    return `${spec}${this.source}:${this.target}`;
  }
}
