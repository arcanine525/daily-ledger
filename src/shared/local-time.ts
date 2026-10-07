export function localTimeToIso(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("INVALID_LOCAL_TIME");
  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const represented = (time: number) => {
    const parts = new Map(
      formatter
        .formatToParts(new Date(time))
        .map((part) => [part.type, part.value]),
    );
    return Date.UTC(
      Number(parts.get("year")),
      Number(parts.get("month")) - 1,
      Number(parts.get("day")),
      Number(parts.get("hour")),
      Number(parts.get("minute")),
    );
  };
  for (let iteration = 0; iteration < 3; iteration++)
    guess += desired - represented(guess);
  if (represented(guess) !== desired)
    throw new RangeError("NONEXISTENT_LOCAL_TIME");
  return new Date(guess).toISOString();
}
