import { describe, it, vi } from "vitest";
import assert from "node:assert";
import { Author } from "./author.js";

const timezones = {
  JST: -540,
  GMT: 0,
  PST: 480,
};
type TimezoneName = keyof typeof timezones;
const mockTimezone = (timezone: TimezoneName) => {
  const mockedGetTimezoneOffset = vi.fn().mockReturnValue(timezones[timezone]);
  return vi
    .spyOn(Date.prototype, "getTimezoneOffset")
    .mockImplementation(mockedGetTimezoneOffset);
};

describe("Author#toString", () => {
  it.each([
    ["PST", "-0800"],
    ["JST", "+0900"],
    ["GMT", "+0000"],
  ] as [TimezoneName, string][])(
    "タイムゾーン: %s",
    (tzname: TimezoneName, tzInHours: string) => {
      //Arrange
      const spy = mockTimezone(tzname);

      // Act
      // 1585666800 = 2020-04-01T00:00:00+09:00 (= 2020-03-31T15:00:00Z)
      const date20200401 = new Date(1585666800 * 1000);
      const author = new Author("John Doe", "johndoe@test.local", date20200401);
      const actual = author.toString();

      // Assert
      assert.equal(
        actual,
        `John Doe <johndoe@test.local> 1585666800 ${tzInHours}`,
      );

      // Arrange
      spy.mockRestore();
    },
  );
});
