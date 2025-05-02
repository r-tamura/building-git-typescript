import * as path from "path";
import { EntryMap } from "./database";
import { Pathname } from "./types";
import { isempty } from "./util";
import { type PosixPath, posixPath, toPathComponentsPosix } from "./util/fs";

export class PathFilter {
  routes: Trie;;
  pathname: PosixPath;
  constructor(routes = new Trie(true, {}), pathname: Pathname = "") {
    this.routes = routes;
    this.pathname = posixPath(pathname);
  }

  static build(paths: PosixPath[]) {
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
    const nextRoutes = this.routes.matched
      ? this.routes
      : this.routes.children[name];
    return new PathFilter(nextRoutes, path.posix.join(this.pathname, name));
  }
}

type TrieMap = Record<string, Trie>;
export class Trie {
  matched: boolean;
  children: TrieMap;

  constructor(matched: boolean, children: TrieMap) {
    this.matched = matched;
    this.children = children;
  }

  static fromPaths(paths: PosixPath[]) {
    const root = Trie.node();
    if (isempty(paths)) {
      root.matched = true;
    }
    for (const pathname of paths) {
      let trie = root;
      for (const component of toPathComponentsPosix(pathname)) {
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
