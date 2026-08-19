export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function zonedParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function partsSerial(parts: ZonedDateParts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
}

export function convertZonedTimeToInstant(
  time: string,
  now: Date,
  timeZone: string,
): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }

  const today = zonedParts(now, timeZone);
  const desired = { ...today, hour, minute };
  const desiredSerial = partsSerial(desired);
  let candidate = desiredSerial;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const observedSerial = partsSerial(zonedParts(new Date(candidate), timeZone));
    const adjustment = desiredSerial - observedSerial;
    candidate += adjustment;
    if (adjustment === 0) {
      break;
    }
  }

  const result = new Date(candidate);
  const roundTrip = zonedParts(result, timeZone);
  return partsSerial(roundTrip) === desiredSerial ? result : null;
}

export function formatZonedConversion(
  result: Date,
  now: Date,
  timeZone?: string,
) {
  const dateFormatter = new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
  const time = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(result);
  const targetTimeZone =
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const resultDay = zonedParts(result, targetTimeZone);
  const currentDay = zonedParts(now, targetTimeZone);
  const dayDifference = Math.round(
    (Date.UTC(resultDay.year, resultDay.month - 1, resultDay.day) -
      Date.UTC(currentDay.year, currentDay.month - 1, currentDay.day)) /
      86_400_000,
  );
  const dayLabel =
    dayDifference === 0
      ? "today"
      : dayDifference === 1
        ? "tomorrow"
        : dayDifference === -1
          ? "yesterday"
          : dateFormatter.format(result);
  return `${time} ${dayLabel}`;
}

export function formatLocalConversion(result: Date, now: Date) {
  return formatZonedConversion(result, now);
}
