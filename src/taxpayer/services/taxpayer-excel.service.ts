/**
 * TaxpayerExcelService - Importación de contribuyentes desde Excel.
 *
 * Extrae la lógica compleja de validación de duplicados y fechas
 * desde el módulo legacy `taxpayer-services.ts`.
 */

import { runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import type { NewTaxpayerExcelInput } from '../taxpayer-utils';
import { normalize, toMiddayUTC } from '../helpers/validation.helper';
import logger from '../../utils/logger';

export async function createTaxpayerExcel(data: NewTaxpayerExcelInput) {
  const {
    providenceNum,
    process,
    name,
    rif,
    contract_type,
    officerName,
    address,
    emition_date,
    categoryId,
    parishId,
  } = data;

  try {
    const users = await taxpayerRepository.findManyUsers();
    const normalizedInputName = normalize(officerName);
    const matchedOfficer = users.find((u) => {
      const normalizedUserName = normalize(u.name);
      return normalizedUserName.includes(normalizedInputName) || normalizedInputName.includes(normalizedUserName);
    });

    if (!matchedOfficer) {
      throw new Error(`No officer found with name similar to "${officerName}"`);
    }

    // ✅ CORRECCIÓN 2026: Verificación mejorada de duplicados
    // Buscar duplicados activos del mismo año ANTES de crear
    // Validar fecha primero para evitar errores
    let inputYear: number;
    try {
      const parsed = new Date(emition_date);
      if (isNaN(parsed.getTime())) {
        throw new Error(
          `Fecha de emisión inválida: "${emition_date}". Por favor verifica el formato de la fecha.`,
        );
      }
      inputYear = parsed.getFullYear();
    } catch (dateError: any) {
      logger.warn('Error al procesar la fecha de emisión', { emition_date, message: dateError?.message });
      throw new Error(`Error al procesar la fecha de emisión: ${dateError.message}`);
    }

    const startOfYear = new Date(Date.UTC(inputYear, 0, 1, 0, 0, 0, 0));
    const endOfYear = new Date(Date.UTC(inputYear + 1, 0, 1, 0, 0, 0, 0));

    const existingByProvidence = await taxpayerRepository.findExistingByProvidence(
      providenceNum,
      startOfYear,
      endOfYear,
    );

    const currentYear = new Date().getFullYear();

    // ✅ CORRECCIÓN 2026: Permitir cualquier fecha del año actual o anterior
    // Solo bloquear fechas muy futuras (más de 1 año adelante) para prevenir errores
    // Validar que la fecha es válida antes de continuar
    const inputDate = new Date(emition_date);
    if (isNaN(inputDate.getTime())) {
      throw new Error(
        `Fecha de emisión inválida: "${emition_date}". Por favor verifica el formato de la fecha (debe ser YYYY-MM-DD o formato ISO).`,
      );
    }

    const maxAllowedDate = new Date();
    maxAllowedDate.setFullYear(maxAllowedDate.getFullYear() + 1); // Permitir hasta 1 año en el futuro

    if (inputDate > maxAllowedDate) {
      throw new Error(
        `La fecha de emisión no puede ser más de un año en el futuro. Fecha recibida: ${inputDate.toLocaleDateString()}`,
      );
    }

    // ✅ REFACTORIZACIÓN 2026: Relajar validaciones para permitir casos 2025 Y casos 2026
    // Solo aplicar restricciones estrictas para duplicados en el mismo año
    // Para casos 2025, permitir edición/creación si no está culminado (trabajo pendiente)
    // Para casos 2026, aplicar validaciones normales de duplicados
    for (const entry of existingByProvidence) {
      const existingProcess = entry.process;
      const existingYear = new Date(entry.emition_date).getFullYear();
      const sameYear = inputYear === existingYear;

      const combination = [existingProcess, process].sort().join('|');

      // ✅ Validación de duplicados: Solo bloquear si es el mismo proceso en el mismo año
      // PERO permitir si es año anterior (2025) para completar trabajo pendiente
      if (existingProcess === process && sameYear) {
        // Permitir si es año anterior (2025) - casos pendientes
        if (inputYear < currentYear) {
          logger.info(
            `⚠️ Permitido: Caso ${process} del año ${inputYear} (año anterior) - trabajo pendiente`,
          );
          continue; // Continuar sin lanzar error
        }
        // Para año actual (2026) o futuro, bloquear duplicados (comportamiento normal)
        throw new Error(
          `Ya existe un contribuyente con proceso ${process} y el mismo número de providencia en el mismo año ${inputYear}.`,
        );
      }

      if (combination === 'AF|VDF' && sameYear) {
        // Permitir si es año anterior (2025) - trabajo pendiente
        if (inputYear < currentYear) {
          logger.info(
            `⚠️ Permitido: Combinación AF|VDF del año ${inputYear} (año anterior) - trabajo pendiente`,
          );
          continue;
        }
        // Para año actual (2026), bloquear combinación (comportamiento normal)
        throw new Error(
          `No puedes registrar un ${process} si ya existe un ${existingProcess} con el mismo número de providencia en el mismo año ${inputYear}.`,
        );
      }

      if (existingProcess === 'FP' && process === 'FP' && sameYear) {
        // Permitir si es año anterior (2025) - trabajo pendiente
        if (inputYear < currentYear) {
          logger.info(
            `⚠️ Permitido: Segundo FP del año ${inputYear} (año anterior) - trabajo pendiente`,
          );
          continue;
        }
        // Para año actual (2026), bloquear duplicado (comportamiento normal)
        throw new Error(
          `No puedes registrar dos FP con el mismo número de providencia en el mismo año ${inputYear}.`,
        );
      }
    }

    // Verificación por nombre similar en el mismo año
    const normalizedName = name.replace(/\s+/g, '').toLowerCase();
    const firstWord = name.trim().split(/\s+/)[0];

    const candidates = await taxpayerRepository.findCandidatesByName(firstWord);

    // ✅ CORRECCIÓN 2026: Validación de nombre similar - solo bloquear duplicados exactos en mismo año
    // Permitir casos 2025 (trabajo pendiente) y casos 2026 (año actual)
    const sameName = candidates.filter(
      (c) =>
        c.name.replace(/\s+/g, '').toLowerCase() === normalizedName &&
        new Date(c.emition_date).getFullYear() === inputYear,
    );

    // Solo bloquear por nombre si es duplicado exacto en el mismo año
    // Para años anteriores (2025), permitir para completar trabajo pendiente
    // Para año actual (2026), bloquear solo si es duplicado exacto (comportamiento normal)
    if (sameName.length > 0) {
      if (inputYear < currentYear) {
        // Año anterior: solo advertencia, permitir
        logger.info(
          `⚠️ Advertencia: Existe contribuyente similar en año ${inputYear}, pero se permite por ser año anterior (trabajo pendiente)`,
        );
      } else {
        // Año actual o futuro: bloquear duplicado exacto
        throw new Error(
          `Ya existe un contribuyente con un nombre similar a "${name}" en el mismo año ${inputYear}.`,
        );
      }
    }

    // ✅ CORRECCIÓN 2026: Permitir fechas progresivas del calendario y fechas pasadas del mismo mes/año
    // Usar mediodía UTC para evitar problemas de zona horaria, pero mantener la fecha que el fiscal ingresa
    const providedDate = new Date(emition_date);

    // Validar que la fecha es válida
    if (isNaN(providedDate.getTime())) {
      throw new Error(
        `Fecha de emisión inválida: "${emition_date}". Por favor verifica el formato de la fecha.`,
      );
    }

    const finalEmitionDate = toMiddayUTC(providedDate);

    // ✅ Validación: Permitir fechas del año actual y anteriores
    // Permitir fechas hasta 1 mes en el futuro para casos anticipados
    const today = new Date();
    const maxFutureDate = new Date(today);
    maxFutureDate.setMonth(maxFutureDate.getMonth() + 1); // Permitir hasta 1 mes en el futuro

    if (finalEmitionDate > maxFutureDate) {
      throw new Error(
        `La fecha de emisión no puede ser más de un mes en el futuro. Fecha recibida: ${providedDate.toLocaleDateString()}`,
      );
    }

    // ✅ PERMITIR fechas pasadas sin restricción (el fiscal puede registrar cosas que se olvidó)
    // Ejemplo: Si es día 20 y quiere cargar algo del día 16 → PERMITIDO
    // No hay validación de fecha mínima - se permite cualquier fecha pasada

    const newTaxpayer = await runTransaction((tx) =>
      taxpayerRepository.createTaxpayerFromExcel(
        {
          providenceNum,
          process,
          name,
          rif,
          contract_type,
          officerId: matchedOfficer.id,
          address,
          emition_date: finalEmitionDate,
          taxpayer_category_id: categoryId,
          parish_id: parishId,
        },
        tx,
      ),
    );

    return newTaxpayer;
  } catch (error: any) {
    logger.error('Error creating taxpayer:', error);

    if (error.code === 'P2002') {
      throw new Error(`A taxpayer with this RIF already exists: ${rif}`);
    }

    if (error instanceof RangeError && error.message.includes('Invalid time value')) {
      throw new Error(`Invalid emition_date: "${emition_date}"`);
    }

    if (error.name === 'PrismaClientValidationError') {
      throw new Error(`Invalid data sent to database: ${error.message}`);
    }

    // ✅ CORRECCIÓN: Mensaje de error más claro para los fiscales
    const errorMessage = error.message || 'Error desconocido al crear el contribuyente';
    logger.error('Error detallado en createTaxpayerExcel:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      data: { providenceNum, process, name, rif, emition_date },
    });
    throw new Error(errorMessage);
  }
}

