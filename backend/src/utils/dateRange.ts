/**
 * Date windows used by reports and by the daily invoice counter. All in UTC,
 * matching what SQLite's date('now') and strftime('%Y-%m', 'now') did — which
 * means a "day" here starts at 03:30 Tehran time. Existing behaviour,
 * preserved rather than corrected, since changing it would shift every
 * report's boundaries at once.
 */
export function todayRange(): { gte: Date; lt: Date } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start, lt: end };
}

export function monthRange(): { gte: Date; lt: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { gte: start, lt: end };
}

/**
 * Pushes a range's end to the last moment of that day. A filter parameter
 * like "2026-01-31" parses to midnight, so comparing with lte would drop
 * everything recorded during that day — the old SQL compared date to date,
 * which included it.
 */
export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * Builds a Prisma date filter from optional bounds, or undefined when
 * neither is set.
 */
export function dateFilter(
  from?: Date,
  to?: Date,
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: endOfDay(to) } : {}),
  };
}

/**
 * The window covering the last `days` calendar days, today included, aligned
 * to the same UTC day boundary every other range here uses.
 *
 * `days: 14` therefore starts thirteen days back and ends where todayRange()
 * ends. Callers that bucket rows by day need the start to be a day boundary
 * rather than "now minus 14×24h", or the first and last buckets each hold a
 * partial day and the chart opens on a dip that is not in the data.
 */
export function lastDaysRange(days: number): { gte: Date; lt: Date } {
  const today = todayRange();
  const start = new Date(today.gte);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { gte: start, lt: today.lt };
}

/**
 * The UTC day a timestamp falls in, as `YYYY-MM-DD`.
 *
 * Deliberately not toISOString().slice(0, 10) at the call site: this is the
 * key a daily bucket is stored under, and it has to agree with the boundary
 * lastDaysRange() draws. Both read the date in UTC, so they cannot drift.
 */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
