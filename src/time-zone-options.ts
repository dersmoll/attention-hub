const FALLBACK_TIME_ZONES = [
  "Africa/Lagos",
  "America/Los_Angeles",
  "America/New_York",
  "Asia/Tokyo",
  "Europe/Kyiv",
  "Europe/London",
  "UTC",
];

const COMMON_TIME_ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Halifax",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Kyiv",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

const TIME_ZONE_CITIES: Record<string, string> = {
  "Pacific/Honolulu": "Honolulu",
  "America/Anchorage": "Anchorage",
  "America/Los_Angeles": "Los Angeles, Vancouver",
  "America/Denver": "Denver, Edmonton",
  "America/Chicago": "Chicago, Winnipeg",
  "America/New_York": "New York, Miami, Toronto",
  "America/Halifax": "Halifax",
  "America/Sao_Paulo": "São Paulo",
  "Atlantic/Azores": "Azores",
  UTC: "UTC, Reykjavik",
  "Europe/London": "London, Dublin, Lisbon",
  "Europe/Paris": "Paris, Berlin, Rome, Madrid, Warsaw, Prague",
  "Europe/Kyiv": "Kyiv, Helsinki, Riga, Sofia, Tallinn, Vilnius",
  "Africa/Lagos": "Lagos",
  "Africa/Johannesburg": "Johannesburg, Harare",
  "Asia/Jerusalem": "Jerusalem",
  "Asia/Dubai": "Dubai, Abu Dhabi, Muscat",
  "Asia/Karachi": "Karachi, Tashkent",
  "Asia/Kolkata": "Kolkata, Mumbai, Delhi, Bengaluru",
  "Asia/Dhaka": "Dhaka",
  "Asia/Bangkok": "Bangkok, Hanoi, Jakarta",
  "Asia/Shanghai": "Shanghai, Beijing, Singapore, Hong Kong, Taipei",
  "Asia/Tokyo": "Tokyo, Seoul",
  "Australia/Adelaide": "Adelaide",
  "Australia/Sydney": "Sydney, Melbourne",
  "Pacific/Auckland": "Auckland",
};

export function canonicalTimeZone(timeZone: string) {
  return timeZone === "Europe/Kiev" ? "Europe/Kyiv" : timeZone;
}

export function getSupportedTimeZones(currentValues: readonly string[] = []) {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }
  ).supportedValuesOf;
  const values = (supportedValuesOf
    ? supportedValuesOf("timeZone")
    : FALLBACK_TIME_ZONES
  ).map(canonicalTimeZone);
  const current = currentValues.map(canonicalTimeZone);
  return Array.from(new Set([...values, "UTC", ...current])).sort(
    (first, second) => first.localeCompare(second),
  );
}

export function timeZoneOffsetLabel(timeZone: string, value = new Date()) {
  try {
    const offset = new Intl.DateTimeFormat("en-GB", {
      timeZone: canonicalTimeZone(timeZone),
      timeZoneName: "longOffset",
    })
      .formatToParts(value)
      .find(({ type }) => type === "timeZoneName")?.value;
    const normalized = (offset ?? "UTC").replace(/^GMT/, "UTC");
    return normalized === "UTC" ? "UTC+00:00" : normalized;
  } catch {
    return "UTC offset unavailable";
  }
}

export function advancedTimeZoneLabel(timeZone: string, value = new Date()) {
  const canonical = canonicalTimeZone(timeZone);
  return `${canonical} — ${timeZoneOffsetLabel(canonical, value)}`;
}

export function shortTimeZoneLabel(timeZone: string) {
  const canonical = canonicalTimeZone(timeZone);
  const cities = TIME_ZONE_CITIES[canonical];
  if (cities) {
    return cities.split(",")[0];
  }
  if (canonical === "UTC") {
    return "UTC";
  }
  const parts = canonical.split("/");
  return (parts[parts.length - 1] || canonical).replace(/_/g, " ");
}

export function timeZoneOptionLabel(timeZone: string, value = new Date()) {
  const canonical = canonicalTimeZone(timeZone);
  const cities = TIME_ZONE_CITIES[canonical] ?? shortTimeZoneLabel(canonical);
  return `(${timeZoneOffsetLabel(canonical, value)}) ${cities} — ${canonical}`;
}

export function getCommonTimeZones(
  currentValues: readonly string[] = [],
  value = new Date(),
) {
  void value;
  const current = currentValues.map(canonicalTimeZone);
  const supported = new Set(getSupportedTimeZones(current));
  const common = COMMON_TIME_ZONES.filter(
    (timeZone) => supported.has(timeZone) && !current.includes(timeZone),
  );
  return [...current, ...common];
}

export function searchTimeZones(
  query: string,
  currentValues: readonly string[] = [],
  value = new Date(),
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return getCommonTimeZones(currentValues, value);
  }
  const current = currentValues.map(canonicalTimeZone);
  const matching = getSupportedTimeZones(current).filter((timeZone) => {
    const searchValue = [
      timeZone,
      shortTimeZoneLabel(timeZone),
      TIME_ZONE_CITIES[timeZone],
      timeZoneOffsetLabel(timeZone, value),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return searchValue.includes(normalizedQuery);
  });
  return Array.from(new Set([...current, ...matching])).slice(0, 80);
}
