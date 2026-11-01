/**
 * CareSync Domain Layer — Explicit Integer Timestamp & Timezone Utilities
 *
 * All stored timestamps are UTC integer epoch milliseconds (`number`).
 * Presentation formatting and clinic-day bucketing convert explicitly using
 * the configured IANA clinic timezone (default: "America/Los_Angeles").
 */

export const DEFAULT_CLINIC_TIMEZONE = 'America/Los_Angeles';

/**
 * Formats an epoch millisecond timestamp as YYYY-MM-DD in the specified timezone.
 */
export function formatDateInZone(epochMs: number, timeZone: string = DEFAULT_CLINIC_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs));

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

/**
 * Formats an epoch millisecond timestamp as readable clinic time (e.g. "09:30 AM").
 */
export function formatTimeInZone(epochMs: number, timeZone: string = DEFAULT_CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(epochMs));
}

/**
 * Formats a [startTime, endTime] window cleanly; automatically includes timezone abbreviations
 * (e.g. PDT -> PST) if the window crosses a Daylight Saving Time transition.
 */
export function formatTimeRangeInZone(
  startMs: number,
  endMs: number,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): string {
  const startOffset = getTimezoneOffsetMs(startMs, timeZone);
  const endOffset = getTimezoneOffsetMs(endMs, timeZone);
  if (startOffset !== endOffset) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });
    return `${fmt.format(new Date(startMs))} – ${fmt.format(new Date(endMs))}`;
  }
  return `${formatTimeInZone(startMs, timeZone)} – ${formatTimeInZone(endMs, timeZone)}`;
}

/**
 * Formats an epoch millisecond timestamp as a full human-readable date + time with zone abbreviation.
 */
export function formatDateTimeInZone(epochMs: number, timeZone: string = DEFAULT_CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(new Date(epochMs));
}

/**
 * Formats YYYY-MM-DD string into a friendly date label (e.g. "Sun, Nov 1, 2026").
 */
export function formatClinicDateLabel(dateStr: string, timeZone: string = DEFAULT_CLINIC_TIMEZONE): string {
  const noonUtc = buildEpochFromClinicDateAndTime(dateStr, '12:00', timeZone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(noonUtc));
}

/**
 * Deterministically converts a clinic local date ("YYYY-MM-DD") and 24-hour time ("HH:MM")
 * in a target IANA timezone into exact UTC integer epoch milliseconds.
 */
export function buildEpochFromClinicDateAndTime(
  dateStr: string,
  time24: string,
  timeZone: string = DEFAULT_CLINIC_TIMEZONE,
): number {
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const [hourStr, minuteStr] = time24.split(':');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  // Start with UTC guess and refine by comparing Intl output in target timezone
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMs = getTimezoneOffsetMs(utcGuess, timeZone);
  const firstPass = utcGuess - offsetMs;
  // Second pass handles DST transition boundaries accurately
  const refinedOffsetMs = getTimezoneOffsetMs(firstPass, timeZone);
  return utcGuess - refinedOffsetMs;
}

function getTimezoneOffsetMs(epochMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = Number(part.value);
    }
  }
  const normalizedHour = map.hour === 24 ? 0 : map.hour;
  const asIfUtc = Date.UTC(
    map.year,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    normalizedHour ?? 0,
    map.minute ?? 0,
    map.second ?? 0,
    0,
  );
  // Strip sub-second precision from epochMs before comparison
  const truncatedEpoch = Math.floor(epochMs / 1000) * 1000;
  return asIfUtc - truncatedEpoch;
}

/**
 * Adds N calendar days to a YYYY-MM-DD clinic date string.
 */
export function addClinicDays(dateStr: string, daysToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd, 12, 0, 0));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
