/**
 * Devuelve el inicio y fin de año en UTC para una fecha dada.
 */
export function getUtcYearBounds(date: Date): { startOfYear: Date; endOfYear: Date } {
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year + 1, 0, 1));
  return { startOfYear, endOfYear };
}

/**
 * Devuelve el inicio y fin de mes en UTC para una fecha dada.
 */
export function getUtcMonthBounds(date: Date): { startOfMonth: Date; endOfMonth: Date } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 1));
  return { startOfMonth, endOfMonth };
}

/**
 * Helper simple para sumar meses en UTC.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

