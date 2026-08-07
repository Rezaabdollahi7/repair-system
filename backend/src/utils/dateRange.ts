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
