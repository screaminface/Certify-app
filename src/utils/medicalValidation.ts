import { subMonths, parseISO, format, parse, isBefore, isEqual } from 'date-fns';

/**
 * Check if medical date is valid (not older than 6 calendar months from today)
 * @param medicalDate ISO date string (YYYY-MM-DD)
 * @returns true if valid, false if expired
 */
export function isMedicalDateValid(medicalDate: string): boolean {
  const today = new Date();
  const sixMonthsAgo = subMonths(today, 6);
  const medical = parseISO(medicalDate);
  
  return medical >= sixMonthsAgo;
}

/**
 * Check if medical date is valid for a specific course start date
 * Medical must be:
 * 1. Before or on the course start date
 * 2. Within 6 months before the course start date
 * @param medicalDate ISO date string (YYYY-MM-DD)
 * @param courseStartDate ISO date string (YYYY-MM-DD)
 * @returns true if valid, false otherwise
 */
export function isMedicalValidForCourse(medicalDate: string, courseStartDate: string): boolean {
  const medical = parseISO(medicalDate);
  const courseStart = parseISO(courseStartDate);
  
  // Medical must be before or on course start date
  if (!isBefore(medical, courseStart) && !isEqual(medical, courseStart)) {
    return false;
  }
  
  // Medical must be within 6 months before course start
  const sixMonthsBeforeCourse = subMonths(courseStart, 6);
  return medical >= sixMonthsBeforeCourse;
}

/**
 * Format ISO date (YYYY-MM-DD) to Bulgarian format (DD.MM.YYYY)
 * @param isoDate ISO date string
 * @returns Bulgarian formatted date string
 */
export function formatDateBG(isoDate: string): string {
  try {
    const date = parseISO(isoDate);
    return format(date, 'dd.MM.yyyy');
  } catch {
    return isoDate; // fallback
  }
}

/**
 * Parse Bulgarian date (DD.MM.YYYY) to ISO format (YYYY-MM-DD)
 * @param bgDate Bulgarian formatted date string
 * @returns ISO date string
 */
export function parseDateBG(bgDate: string): string {
  try {
    const date = parse(bgDate, 'dd.MM.yyyy', new Date());
    return format(date, 'yyyy-MM-dd');
  } catch {
    return bgDate; // fallback
  }
}

/**
 * Get the medical validity message
 */
export const MEDICAL_EXPIRED_MESSAGE = 'Медицинското е по-старо от 6 месеца и не може да бъде използвано.';
