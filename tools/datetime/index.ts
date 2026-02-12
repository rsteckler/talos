/** Date & Time tool — fetches accurate time from public HTTP servers. */

const TIME_SOURCES = [
  "https://www.google.com",
  "https://cloudflare.com",
  "https://www.microsoft.com",
];

async function fetchNetworkTime(): Promise<Date> {
  // Try each source in order; use the Date header from the HTTP response
  for (const url of TIME_SOURCES) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      const dateHeader = response.headers.get("date");
      if (dateHeader) {
        const parsed = new Date(dateHeader);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    } catch {
      // Try next source
    }
  }

  throw new Error("Could not fetch time from any network source");
}

export const handlers = {
  get_current_datetime: async (args: Record<string, unknown>, config?: Record<string, string>) => {
    // Use the arg timezone, fall back to the configured local timezone
    const timezone = typeof args["timezone"] === "string" ? args["timezone"]
      : (config?.["timezone"] || undefined);

    const now = await fetchNetworkTime();

    const result: Record<string, string> = {
      utc: now.toISOString(),
      utcDate: now.toUTCString(),
      dayOfWeek: now.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    };

    if (timezone) {
      try {
        result["local"] = now.toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "long" });
        result["localDate"] = now.toLocaleDateString("en-US", { timeZone: timezone, dateStyle: "full" });
        result["localTime"] = now.toLocaleTimeString("en-US", { timeZone: timezone, timeStyle: "long" });
        result["localDayOfWeek"] = now.toLocaleDateString("en-US", { weekday: "long", timeZone: timezone });
        result["timezone"] = timezone;
      } catch {
        result["timezoneError"] = `Invalid timezone: ${timezone}`;
      }
    }

    return result;
  },
};
