/**
 * dlp-utils.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Calendar-aware DLP (Defect Liability Period) calculation utilities for BuildCorp ERP.
 * Formula: ACTUAL DATE OF COMPLETION + DLP PERIOD AS PER LOA = DLP EXPIRY DATE
 */

import { Entry } from './types';

export interface DlpCalculationResult {
  actualCompletionDate: Date;
  dlpPeriod: string;
  dlpExpiryDate: Date;
  status: 'DLP Period Crossed' | 'DLP Expiring Soon' | 'DLP Active';
  daysRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isActive: boolean;
}

/**
 * Add N calendar months to a date, clamping to month-end if needed.
 * e.g., 2026-01-31 + 1 month = 2026-02-28
 */
export function addCalendarMonths(baseDate: Date, months: number): Date {
  const result = new Date(baseDate);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < originalDay) {
    result.setDate(0); // clamp to last day of previous month
  }
  return result;
}

/**
 * Add N calendar days to a date.
 */
export function addCalendarDays(baseDate: Date, days: number): Date {
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate DLP Expiry Date using calendar-aware date arithmetic.
 * Returns null if the DLP string cannot be parsed or date is invalid.
 */
export function calculateDlpExpiryDate(actualCompletionDate: Date | string | null | undefined, dlpPeriodStr: string | null | undefined): Date | null {
  if (!actualCompletionDate || !dlpPeriodStr) return null;

  const baseDate = typeof actualCompletionDate === 'string' ? new Date(actualCompletionDate) : actualCompletionDate;
  if (!baseDate || isNaN(baseDate.getTime())) return null;

  const normalized = dlpPeriodStr.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return null;

  // 1. Months regex
  const monthsMatch = normalized.match(/^(\d+)\s*(month|months|mon|mons|m)$/);
  if (monthsMatch) {
    const numMonths = parseInt(monthsMatch[1], 10);
    if (isNaN(numMonths) || numMonths <= 0) return null;
    return addCalendarMonths(baseDate, numMonths);
  }

  // 2. Years regex
  const yearsMatch = normalized.match(/^(\d+)\s*(year|years|yr|yrs|y)$/);
  if (yearsMatch) {
    const numYears = parseInt(yearsMatch[1], 10);
    if (isNaN(numYears) || numYears <= 0) return null;
    return addCalendarMonths(baseDate, numYears * 12);
  }

  // 3. Days regex
  const daysMatch = normalized.match(/^(\d+)\s*(day|days|d)$/);
  if (daysMatch) {
    const numDays = parseInt(daysMatch[1], 10);
    if (isNaN(numDays) || numDays <= 0) return null;
    return addCalendarDays(baseDate, numDays);
  }

  // 4. Standalone number (defaults to months)
  const standaloneNumber = normalized.match(/^(\d+)$/);
  if (standaloneNumber) {
    const numMonths = parseInt(standaloneNumber[1], 10);
    if (isNaN(numMonths) || numMonths <= 0) return null;
    return addCalendarMonths(baseDate, numMonths);
  }

  // Unparseable format
  return null;
}

/**
 * Evaluates an Entry record and returns detailed DLP status information.
 * Uses current calendar date.
 */
export function evaluateDlpStatus(entry: Partial<Entry>): DlpCalculationResult | null {
  if (!entry.actualCompletionDate || !entry.dlpPeriodAsPerInLOA) {
    return null;
  }

  const expiryDate = calculateDlpExpiryDate(entry.actualCompletionDate, entry.dlpPeriodAsPerInLOA);
  if (!expiryDate) return null;

  const actualCompletionDate = typeof entry.actualCompletionDate === 'string'
    ? new Date(entry.actualCompletionDate)
    : entry.actualCompletionDate;

  // Compare using midnight calendar dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryMidnight = new Date(expiryDate);
  expiryMidnight.setHours(0, 0, 0, 0);

  const diffMs = expiryMidnight.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let status: 'DLP Period Crossed' | 'DLP Expiring Soon' | 'DLP Active';
  let isExpired = false;
  let isExpiringSoon = false;
  let isActive = false;

  if (daysRemaining < 0) {
    status = 'DLP Period Crossed';
    isExpired = true;
  } else if (daysRemaining <= 30) {
    status = 'DLP Expiring Soon';
    isExpiringSoon = true;
  } else {
    status = 'DLP Active';
    isActive = true;
  }

  return {
    actualCompletionDate,
    dlpPeriod: entry.dlpPeriodAsPerInLOA,
    dlpExpiryDate: expiryDate,
    status,
    daysRemaining,
    isExpired,
    isExpiringSoon,
    isActive,
  };
}
