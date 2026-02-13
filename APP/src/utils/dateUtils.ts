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
  const medical = new Date(medicalDate);
  const startDate = nextMonday(medical);
  
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  
  return {
    courseStartDate: startDate.toISOString().split('T')[0],
    courseEndDate: endDate.toISOString().split('T')[0]
  };
}

/**
 * Format a date to ISO date string (YYYY-MM-DD)
 */
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse ISO date string to Date object
 */
export function parseISODate(isoString: string): Date {
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
