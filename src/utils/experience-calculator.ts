import { Experience } from '../types/profile';

export interface ExperienceCalculation {
  totalMonths: number;
  totalYears: number;
  yearsString: string; // e.g. "5" or "5.5"
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

interface MonthInterval {
  start: number; // year * 12 + month
  end: number;
}

/**
 * Parses a flexible date string (e.g. "2021-04", "Apr 2021", "04/2021", "2021", "Present")
 * into total months from year 0 (year * 12 + month).
 */
export function parseDateToMonths(rawDate: string | undefined | null, isEnd: boolean = false): number | null {
  if (!rawDate) return null;
  const s = rawDate.trim().toLowerCase();
  if (!s) return null;

  if (s === 'present' || s === 'current' || s === 'now' || s === 'today') {
    const now = new Date();
    return now.getFullYear() * 12 + (now.getMonth() + 1);
  }

  // Format: YYYY-MM or YYYY/MM
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    if (year > 1950 && year < 2100 && month >= 1 && month <= 12) {
      return year * 12 + month;
    }
  }

  // Format: MM/YYYY
  const mmyyyyMatch = s.match(/^(\d{1,2})[-/](\d{4})/);
  if (mmyyyyMatch) {
    const month = parseInt(mmyyyyMatch[1], 10);
    const year = parseInt(mmyyyyMatch[2], 10);
    if (year > 1950 && year < 2100 && month >= 1 && month <= 12) {
      return year * 12 + month;
    }
  }

  // Format: "Apr 2021" or "April 2021"
  const monthNameMatch = s.match(/^([a-z]+)[,\s]+(\d{4})/i);
  if (monthNameMatch) {
    const monthName = monthNameMatch[1].toLowerCase();
    const year = parseInt(monthNameMatch[2], 10);
    const month = MONTH_NAMES[monthName];
    if (month && year > 1950 && year < 2100) {
      return year * 12 + month;
    }
  }

  // Format: "2021 Apr"
  const yearMonthMatch = s.match(/^(\d{4})[,\s]+([a-z]+)/i);
  if (yearMonthMatch) {
    const year = parseInt(yearMonthMatch[1], 10);
    const monthName = yearMonthMatch[2].toLowerCase();
    const month = MONTH_NAMES[monthName];
    if (month && year > 1950 && year < 2100) {
      return year * 12 + month;
    }
  }

  // Format: Just Year "2021"
  const yearOnlyMatch = s.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    if (year > 1950 && year < 2100) {
      return year * 12 + (isEnd ? 12 : 1);
    }
  }

  return null;
}

/**
 * Calculates total non-overlapping work experience from employment dates.
 * Overlapping intervals from simultaneous jobs are merged to prevent double-counting.
 * Returns null if dates are missing or invalid (Rule 6: NEEDS_USER).
 */
export function calculateTotalExperience(experiences: Experience[]): ExperienceCalculation | null {
  if (!experiences || experiences.length === 0) {
    return null;
  }

  const rawIntervals: MonthInterval[] = [];

  for (const exp of experiences) {
    const start = parseDateToMonths(exp.startDate, false);
    let end: number | null = null;

    if (exp.current) {
      const now = new Date();
      end = now.getFullYear() * 12 + (now.getMonth() + 1);
    } else {
      end = parseDateToMonths(exp.endDate, true);
    }

    if (start === null || end === null || end < start) {
      // Incomplete or missing dates in experience list -> Rule 6: NEEDS_USER instead of guessing
      return null;
    }

    rawIntervals.push({ start, end });
  }

  if (rawIntervals.length === 0) {
    return null;
  }

  // Sort intervals by start date
  rawIntervals.sort((a, b) => a.start - b.start);

  // Merge overlapping intervals
  const merged: MonthInterval[] = [];
  let current = { ...rawIntervals[0] };

  for (let i = 1; i < rawIntervals.length; i++) {
    const next = rawIntervals[i];
    if (next.start <= current.end) {
      // Overlap detected: extend end date without double-counting
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  // Calculate total months across merged intervals
  let totalMonths = 0;
  for (const interval of merged) {
    totalMonths += (interval.end - interval.start);
  }

  const exactYears = totalMonths / 12;
  const roundedYears = Math.round(exactYears * 10) / 10;
  const integerYears = Math.floor(exactYears);

  return {
    totalMonths,
    totalYears: roundedYears,
    yearsString: String(integerYears)
  };
}
