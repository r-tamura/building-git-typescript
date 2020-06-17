import * as assert from "power-assert";
import { ObjectKeyHash } from "./collection";

type Key = readonly [string, number];
const ser = (k: Key) => k[0] + ":" + k[1];
const des = (str: string) => {
  const [s, n] = str.split(":");
  return [s, Number.parseInt(n)] as const;
};

describe("ObjectKeyHash", () => {
  it("値がセットされているキーの存在判定をしたとき、trueが返される", () => {
    // Arrange
    const hash = new ObjectKeyHash<Key, string>(ser, des);

    // Act
    const actual = hash.has(["1", 1]);

    // Assert
    assert.equal(actual, false);
  });

  it("値がセットされていないキーへアクセスしたとき、undefinedが返される", () => {
    // Act
    const hash = new ObjectKeyHash<Key>(ser, des);
    const actual = hash.get(["1", 1]);

    // Assert
    assert.equal(actual, undefined);
  });

  it("値がセットされているキーの存在判定をしたとき、trueが返される", () => {
    // Arrange
    const hash = new ObjectKeyHash<Key, string>(ser, des);
    hash.set(["1", 1], "value");

    // Act
    const actual = hash.has(["1", 1]);

    // Assert
    assert.equal(actual, true);
  });

  it("値がセットされているキーへアクセスしたとき、その値が返される", () => {
    // Arrange
    const hash = new ObjectKeyHash<Key, string>(ser, des);
    hash.set(["1", 1], "value");

    // Act
    const actual = hash.get(["1", 1]);

    // Assert
    assert.equal(actual, "value");
  });

  it("for .. of 文によるイテレートを実行したとき、デシリアライズされたキーが返される", () => {
    // Arrange
    const hash = new ObjectKeyHash<Key, string>(ser, des);
    hash.set(["1", 1], "value");

    // Act
    for (const [key, value] of hash) {
      // Assert
      assert.deepEqual(key, ["1", 1], "キー");
      assert.equal(value, "value", "バリュー");
    }
  });

  it("削除", () => {
    // Arrange
    const hash = new ObjectKeyHash<Key, string>(ser, des);
    const key = ["1", 1] as const;
    hash.set(key, "value");

    assert.equal(hash.get(key), "value");
    hash.delete(key);
    assert.equal(hash.get(key), undefined);
  });
});
