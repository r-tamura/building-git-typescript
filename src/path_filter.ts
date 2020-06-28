import * as path from "path";
import { Dict, Pathname } from "./types";
import { isempty, eachFile } from "./util";
import { EntryMap } from "./database";

export class PathFilter {
  constructor(public routes = new Trie(true, {}), public pathname = "") {}

  static build(paths: Pathname[]) {
    return new PathFilter(Trie.fromPaths(paths));
  }

  *eachEntry(entries: EntryMap) {
    for (const [name, entry] of Object.entries(entries)) {
      // 木の葉 or nameの子要素を持つ
      if (this.routes.matched || this.routes.children[name]) {
        yield [name, entry] as const;
      }
    }
  }

  join(name: string) {
    const nextRoutes = this.routes.matched ? this.routes : this.routes.children[name];
    return new PathFilter(nextRoutes, path.join(this.pathname, name));
  }
}

type TrieDict = Dict<Trie>;
export class Trie {
  constructor(public matched: boolean, public children: TrieDict) {}

  static fromPaths(paths: string[]) {
    const root = Trie.node();
    if (isempty(paths)) {
      root.matched = true;
    }
    for (const pathname of paths) {
      let trie = root;
      for (const component of eachFile(pathname)) {
        if (!trie.children[component]) {
          // 各パスの指定範囲が重複するとき、範囲の最も広いパスが選ばれるように
          // すでに存在するときは新しいTrie#nodeを作らない
          const child = Trie.node();
          trie.children[component] = child;
        }
        trie = trie.children[component];
      }
      trie.matched = true;
    }
    return root;
  }

  static node() {
    return new Trie(false, {});
  }
}
