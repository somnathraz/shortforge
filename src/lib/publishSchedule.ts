/** Shared publish schedule validation (YouTube publishAt + Meta / deferred queue). */

export function parseScheduleAt(raw: string, nowMs = Date.now()): Date {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Schedule time is required');
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid schedule time — use an ISO datetime (e.g. 2026-09-08T18:30:00.000Z)');
  }
  const minMs = nowMs + 15 * 60_000;
  if (date.getTime() < minMs) {
    throw new Error('Schedule must be at least 15 minutes from now');
  }
  const maxMs = nowMs + 180 * 24 * 60 * 60_000;
  if (date.getTime() > maxMs) {
    throw new Error('Schedule cannot be more than 6 months ahead');
  }
  return date;
}

export function toScheduleIso(date: Date): string {
  return date.toISOString();
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** Local datetime-local value → ISO UTC (browser local zone). */
export function localInputToIso(localValue: string): string {
  const trimmed = localValue.trim();
  if (!trimmed) throw new Error('Pick a date and time');
  // datetime-local is "YYYY-MM-DDTHH:mm" in local time
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid local schedule time');
  return date.toISOString();
}

export function timezoneLabel(now = new Date()): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return `UTC${now.getTimezoneOffset() <= 0 ? '+' : '-'}${Math.abs(now.getTimezoneOffset() / 60)}`;
  }
}
