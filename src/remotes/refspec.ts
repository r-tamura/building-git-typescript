import * as path from "path";
import * as refs from "../refs";
import { Revision } from "../revision";
import { asserts } from "../util";
import { BaseError } from "../util/error";
import * as fsUtil from "../util/fs";

export type TargetRef = string;
export type SourceRef = string;
export type RefspecMappings = Record<
  TargetRef,
  [source: SourceRef | undefined, forced: boolean]
>;

class InvalidRefspec extends BaseError {}

const REFSPEC_FORMAT = /^(\+?)([^:]*)(:([^:]*))?$/;
export class Refspec {
  static parse(spec: string) {
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

  static canonical(
    name: SourceRef | TargetRef | undefined,
  ): SourceRef | TargetRef | undefined {
    if (name === undefined || name === "") {
      return undefined;
    }
    if (!Revision.validRef(name)) {
      return name;
    }

    const first = fsUtil.descend(name)[0];
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
