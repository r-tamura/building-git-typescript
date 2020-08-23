import { Lockfile } from "../lockfile";
import { readByLine } from "../services";
import { Nullable, Pathname } from "../types";
import { ObjectKeyHash } from "../util/collection";
import { clone, first, isempty, last } from "../util/array";
import { asserts, BaseError } from "../util";

export type Name = string;
export type Value = string | number | boolean;

export class ParseError extends BaseError {}
export class Conflict extends BaseError {}

const SECTION_LINE = /^\s*\[([a-z0-9-]+)( "(.+)")?\]\s*($|#|;)/i;
const VARIABLE_LINE = /^\s*([a-z][a-z0-9-]*)\s*=\s*(.*?)\s*($|#|;)/im;
const BLANK_LINE = /\s*(¥|#|;)/;
// const INTEGER = /-?[1-9][0-9]*¥/;

const VALID_SECTION  = /^[a-z0-9-]+$/i;
const VALID_VARIABLE = /^[a-z][a-z0-9-]*$/i;

export function validKey(key: SectionName) {
  return VALID_SECTION.test(first(key)) && VALID_VARIABLE.test(last(key));
}

export class Config {
  #pathname: Pathname;
  #lockfile: Lockfile;
  #lines: Nullable<ObjectKeyHash<NormalizedSection, Line[]>> = null;

  constructor(pathname: Pathname) {
    this.#pathname = pathname;
    this.#lockfile = new Lockfile(pathname);
  }

  async open() {
    if (this.#lines === null) {
      await this.readConfigFile();
    }
  }

  // ロールバック処理をしてファイルを閉じます
  // Note: ファイルを閉じないとGCが警告を表示するため、独自で追加
  async rollback() {
    await this.#lockfile.rollback();
  }

  async openForUpdate() {
    await this.#lockfile.holdForUpdate();
    await this.readConfigFile();
  }

  async readConfigFile() {
    this.#lines = new ObjectKeyHash(Section.serialize, Section.deserialize);
    let section = Section.of([]);
    try {
      const rawlines = await readByLine(this.#pathname);
      for await (const raw of this.readLine(rawlines)) {
        const line = this.parseLine(section, raw);
        section = line.section;
        this.linesFor(section).push(line);
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
      // Note: readlineモジュールは改行を除いた行を返すため、補完する必要がある
      // TODO: 改行コードごと取得できるモジュールを利用する
      buffer += line + "\n";
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
      // Note: JSではネストしたキャプチャは外側の方が先に処理される
      // https://javascript.info/regexp-groups#nested-groups
      const [_, name, __, subsection] = match;
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

  async getAll(key: SectionName) {
    const [name, varname] = this.splitKey(key);
    const [_, lines] = this.findLines(name, varname);
    return lines.map((l: Line) => l.variable?.value);
  }

  async get(key: SectionName) {
    return this.getAll(key).then(last);
  }

  private splitKey(key: SectionName): [name: SectionName, varname: Name] {
    // Note: Array.prototype.popが副作用を持つため配列をコピーする(rubyでも同様)
    key = clone(key);
    const varname = key.pop();
    asserts(varname !== undefined, "セクション名と変数名がリストに含まれる");
    return [key, varname];
  }

  add(key: SectionName, value: Value) {
    const [name, varname] = this.splitKey(key);
    const [section, _] = this.findLines(name, varname);

    this.addVariable(section, name, varname, value);
  }

  private addVariable(section: Nullable<Section>, key: SectionName, varname: Name, value: Value) {
    section ??= this.addSection(key);

    const text = Variable.serialize(varname, value);
    const variable = Variable.of(varname, value);
    const line = Line.of(text, section, variable);

    this.linesFor(section).push(line);
  }

  private addSection(key: SectionName) {
    const section = Section.of(key);
    const line = Line.of(section.headlingLine(), section);

    this.linesFor(section).push(line);
    return section;
  }

  set(key: SectionName, value: Value) {
    const [name, varname] = this.splitKey(key);
    const [section, lines] = this.findLines(name, varname);

    if (isempty(lines)) {
      this.addVariable(section , name, varname, value);
    } else if(lines.length === 1) {
      this.updateVariable(first(lines), varname, value);
    } else {
      throw new Conflict("connot overwrite multiple values with a single value");
    }
  }

  unset(key: SectionName) {
    this.unsetAll(key, (lines) => {
      if (lines.length > 1) {
        throw new Conflict(`${key} has multiple values`);
      }
    });
  }

  replaceAll(key: SectionName, value: Value) {
    const [name, varname] = this.splitKey(key);
    const [section, lines] = this.findLines(name, varname);
    asserts(section !== null);
    this.removeAll(section, lines);
    this.addVariable(section, name, varname, value);
  }

  removeAll(section: Section, lines: Line[]) {
    lines.forEach((line) => {
      const linesFromConfig = this.linesFor(section);
      const name = Section.nomalize(section.name);
      this.#lines?.set(name, linesFromConfig.filter(lineFromConfig => !Line.equals(line, lineFromConfig)));
    });
  }

  unsetAll(key: SectionName, block?: (lines: Line[]) => void) {
    const [name, varname] = this.splitKey(key);
    const [section, lines] = this.findLines(name, varname);

    if (section === null) {
      return;
    }

    if (block) {
      block(lines);
    }

    this.removeAll(section, lines);

    const sectionLines = this.linesFor(section);
    if (sectionLines.length === 1) {
      this.removeSection(name);
    }
  }

  removeSection(key: SectionName) {
    const name = Section.nomalize(key);
    return this.#lines?.delete(name) ? true : false;
  }

  subsections(sectionName: string) {
    asserts(this.#lines !== null);
    const [name, _] = Section.nomalize([sectionName]);
    const sections = [];

    for (const [main, sub] of this.#lines.keys()) {
      if (main === name && sub !== "") {
        sections.push(sub);
      }
    }
    return sections;
  }

  section(key: SectionName) {
    asserts(this.#lines !== null);
    const nomalized = Section.nomalize(key);
    return this.#lines.has(nomalized);
  }

  private updateVariable(line: Line, varname: Name, value: Value) {
    asserts(line.variable !== undefined);
    line.variable.value = value;
    line.text = Variable.serialize(varname, value);
  }

  private findLines(key: SectionName, varname: Name) {
    asserts(this.#lines !== null);

    const name = Section.nomalize(key);
    if (!this.#lines.has(name)) {
      return [null, [] as Line[]] as const;
    }

    const lines = this.#lines.get(name);
    asserts(lines !== undefined);
    const section = lines[0].section;
    const normal = Variable.normalize(varname);

    const filtered = lines.filter((l) => normal === l.normalVariable());
    return [section, filtered] as const;
  }

  private linesFor(section: Section) {
    asserts(this.#lines !== null);
    const normalizedSection = Section.nomalize(section.name);
    if (!this.#lines.has(normalizedSection)) {
      this.#lines.set(normalizedSection, []);
    }
    const lines = this.#lines.get(normalizedSection);
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

  static normalize(name: Name | undefined) {
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

  static equals(s1: Section, s2: Section) {
    return s1.name === s2.name;
  }

  constructor(public name: SectionName) {}

  /**
   * section名とsubsection名をコンフィグファイルの形式で出力します
   * subsection名はダブルクォーテーション(")で囲まれます
   *
   * @example section名のみ
   * const section = Section.of(["editor"])
   * section.headlingLine() // '[editor]'
   *
   * @example subsectionを持つ
   * const section = Section.of(["branch", "master"])
   * section.headlingLine() // '[branch "master"]'
   */
  headlingLine() {
    let line = `[${this.name[0]}`;
    if (this.name.length > 1) {
      line += ` "${this.name.slice(1).join(".")}"`;
    }
    line += "]\n";

    return line;
  }
}

export class Line {

  static equals(l1: Line, l2: Line) {
    return l1.section === l2.section && l1.text === l2.text && Section.equals(l1.section, l2.section);
  }

  static of(text: string, section: Section, variable?: Variable) {
    return new this(text, section, variable);
  }

  constructor(public text: string, public section: Section, public variable?: Variable) {}

  normalVariable() {
    return Variable.normalize(this.variable?.name);
  }
}

