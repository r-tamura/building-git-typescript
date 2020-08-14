import { isempty } from "./util";

export type Name = string;
export type Value = string;

export class Variable {
  constructor(public name: Name, public valeu: Value) {}

  static nomalize(name: Name | undefined) {
    return name?.toLowerCase() ?? null;
  }

  static serialize(name: Name, value: Value) {
    return `\t${name} = ${value}\n`;
  }
}

/** [] or [section name, (subsection name, ...)] */
export type SectionName = string[];

export class Section {
  constructor(public name: SectionName) {}

  static nomalize(name: SectionName) {
    if (isempty(name)) {
      return [];
    }
    const sectionName = name[0].toLowerCase();
    const subsectionName = name.slice(1).join(".");
    return [sectionName, subsectionName];
  }

  headlingLine() {
    let line = `[${this.name[0]}]`;
    if (this.name.length > 1) {
      line += this.name.slice(1).join(".");
    }
    line += "]\n";
    return line;
  }
}

export class Line {
  constructor(public text: string, public section: Section, public variable?: Variable) {}

  normalVariable() {
    return Variable.nomalize(this.variable?.name);
  }
}
