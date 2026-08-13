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

export function formatLocalConversion(result: Date, now: Date) {
  const date = new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(result);
  const time = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(result);
  const localDay = new Date(result.getFullYear(), result.getMonth(), result.getDate());
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDifference = Math.round(
    (localDay.getTime() - currentDay.getTime()) / 86_400_000,
  );
  const dayLabel =
    dayDifference === 0
      ? "today"
      : dayDifference === 1
        ? "tomorrow"
        : dayDifference === -1
          ? "yesterday"
          : date;
  return `${time} ${dayLabel}`;
}
