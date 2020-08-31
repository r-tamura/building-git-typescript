import { asserts } from "../util";

type TargetRef = string;
type SourceRef = string;
type Mappings = Record<TargetRef, [SourceRef, boolean]>;

const REFSPEC_FORMAT = /^(\+?)([^:]+):([^:]+)$/;
export class Refspec {
  static parse(spec: string) {
    const match = REFSPEC_FORMAT.exec(spec);
    asserts(match !== null);
    const [_, forceSign, source, target] = match;
    return new this(source, target, forceSign === "+");
  }

  static expand(specs: string[], refs: string[]): Mappings {
    const refspecs = specs.map((spec) => this.parse(spec));

    return refspecs.reduce((mappings, refspec) => {
      return { ...mappings, ...refspec.matchRefs(refs) };
    }, {});
  }

  constructor(public source: SourceRef, public target: TargetRef, public forced: boolean) {}

  matchRefs(refs: string[]): Mappings {
    if (!this.source.includes("*")) {
      return { [this.target]: [this.source, this.forced] };
    }
    const pattern = new RegExp(`^${this.source.replace("*", "(.*)")}$`);

    return refs.reduce((mappings, ref) => {
      let match;
      if ((match = pattern.exec(ref)) === null) {
        return mappings;
      }
      const dst = match[1] ? this.target.replace("*", match[1]) : this.target;
      return { ...mappings, [dst]: [ref, this.forced] };
    }, {});
  }

  toString() {
    const spec = this.forced ? "+" : "";
    return `${spec}${this.source}:${this.target}`;
  }
}
