import { promises as fs } from "fs";
import { Lockfile } from "./lockfile";
import { FileService, readByLine } from "./services";
import { Nullable, Pathname } from "./types";
import { ObjectKeyHash } from "./util/collection";
import { isempty } from "./util/array";
import { asserts, BaseError } from "./util";

export type Name = string;
export type Value = string | number | boolean;

interface Environment {
  fs?: FileService;
}

class ParseError extends BaseError {}

const SECTION_LINE = /\s*\[([a-z0-9-]+)( "(.+)")?\]\s*(#|;)/i;
const VARIABLE_LINE = /\s*([a-z][a-z0-9-]*)\s*=\s*(.*?)\s*(¥|#|;)/im;
const BLANK_LINE = /\s*(¥|#|;)/;
// const INTEGER = /-?[1-9][0-9]*¥/;



export class Config {
  #pathname: Pathname;
  #lockfile: Lockfile;
  #lines: Nullable<ObjectKeyHash<NormalizedSection, Line[]>> = null;
  #fs: FileService;
  constructor(pathname: Pathname, env: Environment = {}) {
    this.#pathname = pathname;
    this.#lockfile = new Lockfile(pathname);
    this.#fs = env.fs ?? fs;
  }

  async open() {
    if (this.#lines === null) {
      await this.readConfigFile();
    }
  }

  async openForUpdate() {
    await this.#lockfile.holdForUpdate();
    await this.readConfigFile();
  }

  async readConfigFile() {
    this.#lines = new ObjectKeyHash(Section.serialize, Section.deserialize);
    let section = Section.of([]);

    try {
      const rawlines = readByLine(this.#pathname);
      for await (const raw of this.readLine(rawlines)) {
        const line = this.parseLine(section, raw);
        section = line.section;
        this.lineFor(section).push(line);
      }
    } catch (e) {
      const nodeErr = e as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        return;
      }
      throw e;
    }
  }

  async save() {
    asserts(this.#lines !== null);
    for (const [_section, lines] of this.#lines) {
      for (const line of lines) {
        await this.#lockfile.write(line.text);
      }
    }
    await this.#lockfile.commit();
  }

  private async *readLine(file: AsyncIterable<string>) {
    let buffer = "";
    for await (const line of file) {
      buffer += line;
      // "\" + "\n" で終わる行は複数行で一つのvariableなので読み続ける
      if (!buffer.endsWith("\\\n")) {
        yield buffer;
        buffer = "";
      }
    }
  }

  private parseLine(section: Section, line: string) {
    let match: Nullable<RegExpMatchArray>;
    if ((match = SECTION_LINE.exec(line))) {
      const [_, name, subsection] = match;
      const section = Section.of([name, subsection]);
      return Line.of(line, section);
    } else if ((match = VARIABLE_LINE.exec(line))) {
      const [_, name, value] = match;
      const variable = Variable.of(name, this.parseValue(value));
      return Line.of(line, section, variable);
    } else if ((match = BLANK_LINE.exec(line))) {
      return Line.of(line, section);
    }

    throw new ParseError(`bad config line ${this.lineCount() + 1} in file ${this.#pathname}`);
  }

  private parseValue(value: string) {

    switch(value) {
      case "yes":
      case "on":
      case "true":
        return true;
      case "no":
      case "off":
      case "false":
        return false;
    }

    const integer = Number.parseInt(value);
    if (!Number.isNaN(integer)) {
      return integer;
    }
    return value.replace(/\\\n/, "");
  }

  private lineFor(section: Section) {
    asserts(this.#lines !== null);
    const lines = this.#lines.get(Section.nomalize(section.name));
    asserts(lines !== undefined, "コンフィグに存在しないセクション名");
    return lines;
  }

  private lineCount() {
    asserts(this.#lines !== null);
    let count = 0;
    for (const [_, lines] of this.#lines) {
      count += lines.length;
    }
    return count;
  }
}

export class Variable {
  static of(name: Name, value: Value) {
    return new this(name, value);
  }

  constructor(public name: Name, public value: Value) {}

  static nomalize(name: Name | undefined) {
    return name?.toLowerCase() ?? null;
  }

  static serialize(name: Name, value: Value) {
    return `\t${name} = ${value}\n`;
  }
}

/** [] or [section name, (subsection name, ...)] */
export type SectionName = [section: string, ...subsection: string[]] | [];
export type NormalizedSection = [section: string, subsection: string] | []

export class Section {
  constructor(public name: SectionName) {}

  static of(name: SectionName) {
    return new this(name);
  }

  static nomalize(name: SectionName): NormalizedSection {
    if (isempty(name)) {
      return [];
    }
    const sectionName = name[0].toLowerCase();
    const subsectionName = name.slice(1).join(".");
    return [sectionName, subsectionName];
  }

  static serialize([section, subsection]: NormalizedSection) {
    return `${section}\0${subsection}`;
  }

  static deserialize(key: string) {
    return key.split("\0") as NormalizedSection;
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

  static of(text: string, section: Section, variable?: Variable) {
    return new this(text, section, variable);
  }

  constructor(public text: string, public section: Section, public variable?: Variable) {}

  normalVariable() {
    return Variable.nomalize(this.variable?.name);
  }
}

