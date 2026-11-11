/**
 * Check if a date is a Monday
 */
export function isMonday(date: Date): boolean {
  return date.getDay() === 1;
}

/**
 * Get the next Monday after a given date
 * If the date is already Monday, returns the same date
 */
export function nextMonday(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // If already Monday, return the same date
  if (dayOfWeek === 1) {
    return result;
  }
  
  // Calculate days until next Monday
  // If Sunday (0), add 1 day
  // If Tuesday (2), add 6 days
  // If Wednesday (3), add 5 days
  // If Thursday (4), add 4 days
  // If Friday (5), add 3 days
  // If Saturday (6), add 2 days
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  
  result.setDate(result.getDate() + daysUntilMonday);
  return result;
}

/**
 * Compute course start and end dates based on medical date
 * Course starts on Monday (medical date if Monday, otherwise next Monday)
 * Course ends 7 days after start
 */
export function computeCourseDates(medicalDate: string): {
  courseStartDate: string;
  courseEndDate: string;
} {
  const medical = parseISODate(medicalDate);
  const startDate = nextMonday(medical);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  return {
    courseStartDate: toISODate(startDate),
    courseEndDate: toISODate(endDate)
  };
}

/**
 * Format a date to ISO date string (YYYY-MM-DD) using LOCAL date components.
 * Never use toISOString() for calendar dates: it converts to UTC, and around
 * the DST switch that shifts the date by a day (courses landing on Sunday).
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse ISO date string (YYYY-MM-DD) to a LOCAL Date object.
 * new Date('YYYY-MM-DD') parses as UTC midnight, which combined with local
 * getDay()/setDate() breaks around DST transitions — parse locally instead.
 */
export function parseISODate(isoString: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoString);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(isoString);
}

export function formatDisplayDate(
  dateValue: string | Date | null | undefined,
  locale: string,
  timeZone: string,
  fallback: string
): string {
  if (!dateValue) return fallback;

  const parsed = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(parsed);
}
