/**
 * Helper para generación de archivos Excel en el backend (reportes, exportaciones).
 * Usa la librería xlsx (SheetJS). Centraliza creación de workbook, hojas y celdas.
 */

import * as XLSX from "xlsx";

export type WorkBook = XLSX.WorkBook;
export type WorkSheet = XLSX.WorkSheet;

/**
 * Crea un workbook vacío.
 */
export function createWorkbook(): WorkBook {
    return XLSX.utils.book_new();
}

/**
 * Crea una hoja a partir de un array de filas (cada fila es un array de valores).
 * Útil para encabezados + datos.
 */
export function createSheetFromRows(rows: unknown[][]): WorkSheet {
    return XLSX.utils.aoa_to_sheet(rows);
}

/**
 * Añade una hoja al workbook con el nombre indicado.
 */
export function addSheet(workbook: WorkBook, sheet: WorkSheet, sheetName: string): void {
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
}

/**
 * Escribe el workbook a un Buffer (para enviar como descarga o guardar).
 */
export function writeToBuffer(workbook: WorkBook, bookType: "xlsx" | "csv" = "xlsx"): Buffer {
    return XLSX.write(workbook, { type: "buffer", bookType }) as Buffer;
}

/**
 * Crea una hoja con encabezados y filas de datos, y la añade al workbook.
 * @param workbook - Workbook existente
 * @param sheetName - Nombre de la pestaña
 * @param headers - Primera fila (encabezados)
 * @param rows - Filas de datos (array de arrays)
 */
export function addSheetWithHeaders(
    workbook: WorkBook,
    sheetName: string,
    headers: unknown[],
    rows: unknown[][]
): void {
    const allRows = [headers, ...rows];
    const sheet = createSheetFromRows(allRows);
    addSheet(workbook, sheet, sheetName);
}

/**
 * Ajusta el ancho de columnas al contenido (aproximado por longitud del string).
 */
export function autoSizeColumns(sheet: WorkSheet, maxCols?: number): void {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    const cols = maxCols ?? range.e.c + 1;
    const wch: number[] = [];
    for (let c = 0; c < cols; c++) {
        let max = 10;
        for (let r = range.s.r; r <= range.e.r; r++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            const val = cell?.v != null ? String(cell.v).length : 0;
            if (val > max) max = val;
        }
        wch.push(Math.min(max + 2, 50));
    }
    sheet["!cols"] = wch.map((w) => ({ wch: w }));
}

export const excelHelper = {
    createWorkbook,
    createSheetFromRows,
    addSheet,
    writeToBuffer,
    addSheetWithHeaders,
    autoSizeColumns,
};
