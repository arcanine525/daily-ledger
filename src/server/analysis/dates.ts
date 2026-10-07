const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;
export function resolveDeadline(input: {
  readonly phrase: string | null;
  readonly occurredAt: string;
  readonly timezone: string;
}): string | null {
  if (!input.phrase) return null;
  const phrase = input.phrase
    .trim()
    .toLowerCase()
    .replace(/^by\s+/, "");
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: input.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(input.occurredAt));
  const fields = new Map(parts.map((part) => [part.type, part.value]));
  const base = new Date(
    `${fields.get("year")}-${fields.get("month")}-${fields.get("day")}T00:00:00Z`,
  );
  if (phrase === "tomorrow") {
    base.setUTCDate(base.getUTCDate() + 1);
    return base.toISOString().slice(0, 10);
  }
  if (phrase === "today") return base.toISOString().slice(0, 10);
  const weekday = weekdays.findIndex((day) => day === phrase);
  if (weekday >= 0) {
    base.setUTCDate(base.getUTCDate() + ((weekday - base.getUTCDay() + 7) % 7));
    return base.toISOString().slice(0, 10);
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(phrase);
  if (iso) {
    const date = new Date(`${phrase}T00:00:00Z`);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === phrase
      ? phrase
      : null;
  }
  const named = /^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(phrase);
  if (named) {
    const month = months.findIndex((m) => m === named[1]),
      day = Number(named[2]);
    if (month < 0) return null;
    let year = Number(named[3] ?? base.getUTCFullYear());
    let date = new Date(Date.UTC(year, month, day));
    if (!named[3] && date < base) {
      year++;
      date = new Date(Date.UTC(year, month, day));
    }
    if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    return date.toISOString().slice(0, 10);
  }
  return null;
}
