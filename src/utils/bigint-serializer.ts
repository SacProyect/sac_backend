/**
 * Serialización segura de objetos que pueden contener BigInt.
 * JSON.stringify nativo lanza "Do not know how to serialize a BigInt"
 * para campos como providenceNum. Este módulo evita el parche global
 * (BigInt.prototype.toJSON) y centraliza la lógica de serialización.
 */

/**
 * Convierte recursivamente un valor serializando BigInt a string
 * (se preserva precisión para números grandes).
 * Objetos, arrays y valores primitivos se recorren sin modificar
 * excepto los BigInt que se reemplazan por string.
 */
export function serializeForJson<T>(value: T): Serialized<T> {
  if (value === null || value === undefined) {
    return value as Serialized<T>;
  }
  if (typeof value === "bigint") {
    return value.toString() as Serialized<T>;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value as Serialized<T>;
  }
  if (value instanceof Date) {
    return value.toISOString() as Serialized<T>;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item)) as Serialized<T>;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = serializeForJson(v);
    }
    return out as Serialized<T>;
  }
  return value as Serialized<T>;
}

/**
 * Tipo helper: reemplaza bigint por string en la estructura.
 * Simplificado para uso en respuestas API.
 */
export type Serialized<T> = T extends bigint
  ? string
  : T extends Date
    ? string
    : T extends Array<infer U>
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

/**
 * JSON.stringify con replacer que convierte BigInt a string.
 * Útil para logs o cuando se necesita el string JSON directamente.
 */
export function safeStringify(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, val) => (typeof val === "bigint" ? val.toString() : val),
    space
  );
}
