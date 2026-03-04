import { Decimal } from "@prisma/client/runtime/library";

/**
 * Suma una colección de montos usando Decimal para evitar errores de precisión.
 */
export function sumDecimal(values: (number | Decimal)[]): Decimal {
  return values.reduce<Decimal>(
    (acc, v) => acc.plus(v instanceof Decimal ? v : new Decimal(v)),
    new Decimal(0),
  );
}

