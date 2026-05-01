export function getShortDay(day: number) {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thr", "Fri", "Sat"] as const;
  const dayNumber = day % 7;
  return DAYS[dayNumber];
}

export function getShortMonth(month: number) {
  const MONSTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ] as const;
  const monthNo = month % 12;
  return MONSTHS[monthNo];
}

export function timeForPrint(time: Date) {
  const year = time.getFullYear().toString();
  const month = (time.getMonth() + 1).toString().padStart(2, "0");
  const date = time.getDate().toString().padStart(2, "0");
  const hour = time.getHours().toString().padStart(2, "0");
  const minute = time.getMinutes().toString().padStart(2, "0");
  const second = time.getSeconds().toString().padStart(2, "0");
  const day = getShortDay(time.getDay());
  const smonth = getShortMonth(time.getMonth());
  return { year, month, date, hour, minute, second, day, smonth };
}
