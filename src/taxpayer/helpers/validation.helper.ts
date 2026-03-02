/**
 * Helpers de validación para datos tributarios de SAC.
 *
 * Todas las funciones aquí son puras para facilitar el testing.
 */

/**
 * Valida un RIF venezolano.
 * Formatos permitidos: V, J, G, E, P + 9 dígitos (ej: J123456789).
 */
export function isValidRif(rif: string | null | undefined): boolean {
  if (!rif) return false;
  const normalized = rif.toUpperCase().trim();
  const rifRegex = /^[VJGEP]\d{9}$/;
  return rifRegex.test(normalized);
}

/**
 * Normaliza un string para uso en reportes/consultas:
 * - Convierte null/undefined a cadena vacía.
 * - Hace trim de espacios.
 * - Colapsa espacios múltiples en uno.
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, " ");
}

/**
 * Determina si un valor es un string no vacío (después de trim).
 */
export function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Valida un monto tributario:
 * - Debe ser un número finito.
 * - Debe ser mayor o igual a 0.
 */
export function isValidTaxAmount(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return false;
  return num >= 0;
}

/**
 * Valida una fecha tributaria:
 * - Debe ser una fecha válida.
 * - No puede ser más de 1 año en el futuro.
 * - No se restringen fechas pasadas (casos históricos).
 */
export function isValidTaxDate(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return false;

  const now = new Date();
  const maxFuture = new Date(now);
  maxFuture.setFullYear(now.getFullYear() + 1);

  return date <= maxFuture;
}

/**
 * Normaliza un string para comparaciones "fuzzy" (ej. nombres de funcionarios):
 * - Elimina acentos
 * - Convierte a minúsculas
 * - Colapsa espacios múltiples
 */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Devuelve una nueva fecha fijada al mediodía UTC del mismo día.
 * Útil para evitar problemas de zona horaria al guardar fechas "de calendario".
 */
export function toMiddayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
}


