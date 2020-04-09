import { Author } from "./author";
import * as assert from "power-assert";

const timezones = {
  JST: -540,
  GMT: 0,
  PST: 480
};
type TimezoneName = keyof typeof timezones;
const mockTimezone = (timezone: TimezoneName) => {
  const mockedGetTimezoneOffset = jest
    .fn()
    .mockReturnValue(timezones[timezone]);
  return jest
    .spyOn(Date.prototype, "getTimezoneOffset")
    .mockImplementation(mockedGetTimezoneOffset);
};

describe("Author#toString", () => {
  it.each([
    ["PST", "-0800"],
    ["JST", "+0900"],
    ["GMT", "+0000"]
  ] as [TimezoneName, string][])(
    "タイムゾーン: %s",
    (tzname: TimezoneName, tzInHours: string) => {
      //Arrange
      const spy = mockTimezone(tzname);

      // Act
      const date20200401 = new Date(2020, 3, 1);
      const author = new Author("John Doe", "johndoe@test.local", date20200401);
      const actual = author.toString();

      // Assert
      assert.equal(
        actual,
        `John Doe <johndoe@test.local> 1585666800 ${tzInHours}`
      );

      // Arrange
      spy.mockRestore();
    }
  );
});
