import * as path from "path/posix";
import * as refs from "../refs.js";
import { Revision } from "../revision.js";
import { asserts } from "../util/index.js";
import * as arrayUtil from "../util/array.js";
import { BaseError } from "../util/error.js";
import * as fsUtil from "../util/fs.js";

export type TargetRef = string;
export type SourceRef = string;
export type RefspecMappings = Record<
  TargetRef,
  [source: SourceRef | undefined, forced: boolean]
>;

class InvalidRefspec extends BaseError {}

const REFSPEC_FORMAT = /^(\+?)([^:]*)(:([^:]*))?$/;
export class Refspec {
  static parse(spec: string): Refspec {
    const match = REFSPEC_FORMAT.exec(spec);
    asserts(match !== null);
    const forceSign = match[1];
    const source = this.canonical(match[2]);
    const target = this.canonical(match[4]) ?? source;

    if (target === undefined) {
      throw new InvalidRefspec("'target'が未指定です");
    }

    return new this(source, target, forceSign === "+");
  }

  static expand(specs: string[], refs: string[]): RefspecMappings {
    const refspecs = specs.map((spec) => this.parse(spec));

    return refspecs.reduce((mappings, refspec) => {
      return { ...mappings, ...refspec.matchRefs(refs) };
    }, {});
  }

  static invert(specs: string[], ref: string): string {
    const refspecs = specs.map((spec) => this.parse(spec));

    const map = refspecs.reduce((mappings, refspec) => {
      asserts(refspec.source !== undefined);
      const invertedRefspec = new this(
        refspec.target,
        refspec.source,
        refspec.forced,
      );
      return { ...mappings, ...invertedRefspec.matchRefs([ref]) };
    }, {});
    return arrayUtil.first(Object.keys(map));
  }

  static canonical(
    name: SourceRef | TargetRef | undefined,
  ): SourceRef | TargetRef | undefined {
    if (name === undefined || name === "") {
      return undefined;
    }
    if (!Revision.validRef(name)) {
      return name;
    }

    // ref name は POSIX 形式("master", "origin/master" 等)
    const first = fsUtil.descendUnix(name)[0];
    const dirs = [refs.REFS_DIR, refs.HEADS_DIR, refs.REMOTES_DIR];
    const prefix = dirs.find((dir) => path.basename(dir) === first);

    return path.join(prefix ? path.dirname(prefix) : refs.HEADS_DIR, name);
  }

  constructor(
    public source: SourceRef | undefined,
    public target: TargetRef,
    public forced: boolean,
  ) {}

  matchRefs(refs: string[]): RefspecMappings {
    if (this.source === undefined || !this.source.includes("*")) {
      return { [this.target]: [this.source, this.forced] };
    }
    const pattern = new RegExp(`^${this.source.replace("*", "(.*)")}$`);

    return refs.reduce((mappings, ref) => {
      const match = pattern.exec(ref);
      if (match === null) {
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
