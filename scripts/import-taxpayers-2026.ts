import * as XLSX from 'xlsx';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de entorno (el .env está en la raíz del proyecto, dos niveles arriba)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ 
    path: envPath,
    override: true 
});

// Verificar que DATABASE_URL esté configurado
if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL no está configurado.');
    console.error(`   Buscando .env en: ${envPath}`);
    console.error('   Por favor, asegúrate de que el archivo .env existe y contiene DATABASE_URL');
    process.exit(1);
}

import { db } from '../src/utils/db-server';
import { createTaxpayerExcel } from '../src/taxpayer/taxpayer-services';

/**
 * Script para importar los primeros 47 contribuyentes del año 2026 desde Excel
 * 
 * Uso: npx tsx scripts/import-taxpayers-2026.ts
 */

// Función para normalizar nombres (igual que en taxpayer.services.ts)
function normalize(str: string): string {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

// Función para limpiar problemas de codificación
function cleanEncoding(text: string): string {
    if (!text) return '';
    
    return text
        .replace(/Ã\?/g, 'Ñ')
        .replace(/Ã±/g, 'ñ')
        .replace(/Ã¡/g, 'á')
        .replace(/Ã©/g, 'é')
        .replace(/Ã­/g, 'í')
        .replace(/Ã³/g, 'ó')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã/g, 'Ñ')
        .replace(/Ã¼/g, 'ü')
        .replace(/Ã‰/g, 'É')
        .replace(/Ã"/g, 'Ñ')
        .replace(/\s+/g, ' ') // Normalizar espacios múltiples
        .trim();
}

// Mapeo manual de nombres problemáticos del Excel a nombres en la BD
const fiscalNameMapping: Record<string, string> = {
    'ANDREYNA QUIROZ': 'Andreina Quiroz',
    'ANDREYNA  QUIROZ': 'Andreina Quiroz',
    'ANDREINA DEL VALLE CEDEÑO': 'Andreina Cedeño',
    'ANDREINA DEL VALLE CEDEÃ?O': 'Andreina Cedeño',
    'EVANI AIDALE PONCE DUQUE': 'Evani Ponce',
    'ERIKA YARIMAR ANGULO BENITEZ': 'Erika Angulo',
    'JOHANGELLY DAMARIELIS VILLEGAS PERAZA': 'Johangelly Villegas',
    'CESAR MIGUEL BELLO ZAMBRANO': 'CESAR BELLO',
    'CESAR RIVAS': 'César Alejandro Rivas Delgado',
    'AXEL DE LA ROSA': 'Axel Ramon De La Rosa Luna',
};

// Función para buscar fiscal por nombre (búsqueda case-insensitive y muy flexible)
async function findOfficerByName(officerName: string, allUsers: any[]) {
    // Verificar si hay un mapeo manual primero
    const mappedName = fiscalNameMapping[officerName.toUpperCase()];
    if (mappedName) {
        const mappedMatch = allUsers.find(u => normalize(u.name) === normalize(mappedName));
        if (mappedMatch) return mappedMatch;
    }
    // Limpiar problemas de codificación y espacios extra
    const cleanedName = cleanEncoding(officerName).replace(/\s+/g, ' ').trim();
    const normalizedInputName = normalize(cleanedName);
    
    // Extraer palabras clave (nombres y apellidos, mínimo 3 caracteres)
    const inputWords = normalizedInputName.split(' ').filter(w => w.length >= 3);
    
    if (inputWords.length === 0) {
        return null;
    }
    
    // 1. Buscar coincidencia exacta (después de normalizar - case insensitive)
    let matchedOfficer = allUsers.find((u) => {
        const normalizedUserName = normalize(u.name);
        return normalizedUserName === normalizedInputName;
    });
    
    if (matchedOfficer) return matchedOfficer;
    
    // 2. Buscar por todas las palabras clave presentes (orden flexible)
    if (inputWords.length >= 2) {
        matchedOfficer = allUsers.find((u) => {
            const normalizedUserName = normalize(u.name);
            // Verificar si todas las palabras clave están presentes
            const allWordsMatch = inputWords.every(word => normalizedUserName.includes(word));
            return allWordsMatch;
        });
    }
    
    if (matchedOfficer) return matchedOfficer;
    
    // 3. Buscar por mayoría de palabras (al menos 70% de coincidencia)
    if (inputWords.length >= 2) {
        matchedOfficer = allUsers.find((u) => {
            const normalizedUserName = normalize(u.name);
            const matchingWords = inputWords.filter(word => normalizedUserName.includes(word));
            const requiredMatches = Math.ceil(inputWords.length * 0.7); // Al menos 70%
            return matchingWords.length >= requiredMatches;
        });
    }
    
    if (matchedOfficer) return matchedOfficer;
    
    // 4. Buscar por primera palabra + alguna otra palabra clave
    if (inputWords.length >= 2) {
        const firstWord = inputWords[0];
        const otherWords = inputWords.slice(1);
        matchedOfficer = allUsers.find((u) => {
            const normalizedUserName = normalize(u.name);
            const hasFirstWord = normalizedUserName.includes(firstWord);
            const hasOtherWord = otherWords.some(word => normalizedUserName.includes(word));
            return hasFirstWord && hasOtherWord;
        });
    }
    
    if (matchedOfficer) return matchedOfficer;
    
    // 5. Buscar por última palabra + alguna otra palabra clave
    if (inputWords.length >= 2) {
        const lastWord = inputWords[inputWords.length - 1];
        const otherWords = inputWords.slice(0, -1);
        matchedOfficer = allUsers.find((u) => {
            const normalizedUserName = normalize(u.name);
            const hasLastWord = normalizedUserName.includes(lastWord);
            const hasOtherWord = otherWords.some(word => normalizedUserName.includes(word));
            return hasLastWord && hasOtherWord;
        });
    }
    
    if (matchedOfficer) return matchedOfficer;
    
    // 6. Buscar por coincidencia parcial más flexible
    matchedOfficer = allUsers.find((u) => {
        const normalizedUserName = normalize(u.name);
        // Verificar si el nombre normalizado contiene el input o viceversa
        return normalizedUserName.includes(normalizedInputName) || 
               normalizedInputName.includes(normalizedUserName) ||
               // O si al menos 2 palabras coinciden
               inputWords.filter(word => normalizedUserName.includes(word)).length >= 2;
    });
    
    return matchedOfficer;
}

// Función para buscar parroquia por nombre
async function findParishByName(parishName: string) {
    const parishes = await db.parish.findMany();
    const normalizedInputName = normalize(parishName);
    const matchedParish = parishes.find((p) =>
        normalize(p.name).includes(normalizedInputName) || normalizedInputName.includes(normalize(p.name))
    );
    return matchedParish;
}

// Función para buscar categoría por nombre (si no se encuentra, usar la primera disponible)
async function findCategoryByName(categoryName?: string) {
    const categories = await db.taxpayerCategory.findMany();
    
    if (!categoryName || categoryName.trim() === '') {
        // Si no hay categoría, usar la primera disponible
        return categories[0] || null;
    }
    
    const normalizedInputName = normalize(categoryName);
    const matchedCategory = categories.find((c) =>
        normalize(c.name).includes(normalizedInputName) || normalizedInputName.includes(normalize(c.name))
    );
    return matchedCategory || categories[0] || null; // Si no se encuentra, usar la primera
}

// Función para mapear proceso
function mapProcess(programa: string): string {
    const normalized = normalize(programa);
    if (normalized.includes('vdf')) return 'VDF';
    if (normalized.includes('af')) return 'AF';
    if (normalized.includes('fp')) return 'FP';
    return 'VDF'; // Por defecto
}

// Función para mapear tipo de contrato
function mapContractType(calificacion: string): string {
    const normalized = normalize(calificacion);
    if (normalized.includes('especial')) return 'SPECIAL';
    if (normalized.includes('ordinario') || normalized.includes('ordinaria')) return 'ORDINARY';
    return 'ORDINARY'; // Por defecto
}

// Función para calcular similitud entre strings (para sugerencias)
function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

// Función de distancia de Levenshtein
function levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

async function importTaxpayers() {
    try {
        // Ruta al archivo Excel
        const excelPath = path.join(__dirname, '../../CONTRIBUYENTES DEL SAC 2026.xlsx');
        
        // Verificar que el archivo existe
        const fs = require('fs');
        if (!fs.existsSync(excelPath)) {
            throw new Error(`No se encontró el archivo Excel en: ${excelPath}`);
        }
        
        console.log(`📖 Leyendo archivo Excel: ${excelPath}`);
        
        // Leer el archivo Excel
        const workbook = XLSX.readFile(excelPath);
        const sheetName = workbook.SheetNames[0]; // Primera hoja
        const worksheet = workbook.Sheets[sheetName];
        
        // Convertir a JSON
        const data: any[] = XLSX.utils.sheet_to_json(worksheet, { raw: false });
        
        console.log(`📊 Total de filas encontradas: ${data.length}`);
        console.log(`\n🚀 Iniciando importación de los primeros 47 contribuyentes...\n`);
        
        const limit = Math.min(47, data.length);
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];
        
        // Obtener todas las parroquias, categorías y usuarios una vez
        const allParishes = await db.parish.findMany();
        const allCategories = await db.taxpayerCategory.findMany();
        const allUsers = await db.user.findMany({
            where: {
                role: { in: ['FISCAL', 'SUPERVISOR'] }
            }
        });
        
        console.log(`📋 Parroquias disponibles: ${allParishes.length}`);
        console.log(`📋 Categorías disponibles: ${allCategories.length}`);
        console.log(`👥 Fiscales disponibles: ${allUsers.length}\n`);
        
        // Mostrar lista de fiscales disponibles para referencia
        if (allUsers.length > 0) {
            console.log(`📝 Fiscales en la base de datos:`);
            allUsers.forEach((u, idx) => {
                console.log(`   ${idx + 1}. ${u.name} (${u.role})`);
            });
            console.log('');
        }
        
        for (let i = 0; i < limit; i++) {
            const row = data[i];
            const rowNum = i + 1;
            
            try {
                // Extraer datos del Excel
                const nombre = (row['SUJETO PASIVO'] || '').toString().trim();
                const rif = (row['RIF'] || '').toString().trim();
                const providenceNum = parseInt((row['NRO DE PROVIDENCIA'] || '0').toString().trim());
                const direccion = (row['DIRECCION '] || row['DIRECCION'] || '').toString().trim();
                const parroquiaNombre = (row['PARROQUIA'] || '').toString().trim();
                const fiscalNombre = (row['FISCAL'] || '').toString().trim();
                const programa = (row['PROGRAMA'] || '').toString().trim();
                const calificacion = (row['CALIFICACION'] || '').toString().trim();
                
                // Validar campos requeridos
                if (!nombre || !rif || !providenceNum || !fiscalNombre) {
                    throw new Error(`Fila ${rowNum}: Faltan campos requeridos (nombre, RIF, providencia o fiscal)`);
                }
                
                // Limpiar nombre del fiscal del Excel (eliminar espacios extra y problemas de codificación)
                let fiscalNombreLimpio = cleanEncoding(fiscalNombre);
                
                // Intentar múltiples variaciones del nombre
                let fiscal = await findOfficerByName(fiscalNombreLimpio, allUsers);
                
                // Si no se encuentra, intentar sin "DEL VALLE" u otros prefijos comunes
                if (!fiscal && fiscalNombreLimpio.includes('DEL VALLE')) {
                    fiscalNombreLimpio = fiscalNombreLimpio.replace(/DEL VALLE\s+/gi, '').trim();
                    fiscal = await findOfficerByName(fiscalNombreLimpio, allUsers);
                }
                
                // Si aún no se encuentra, intentar solo primer nombre + apellido
                if (!fiscal) {
                    const words = fiscalNombreLimpio.split(' ').filter(w => w.length > 2);
                    if (words.length >= 2) {
                        const shortName = `${words[0]} ${words[words.length - 1]}`;
                        fiscal = await findOfficerByName(shortName, allUsers);
                    }
                }
                if (!fiscal) {
                    // Mostrar sugerencias de fiscales similares
                    const normalizedInput = normalize(fiscalNombreLimpio);
                    const suggestions = allUsers
                        .map(u => ({
                            name: u.name,
                            similarity: calculateSimilarity(normalizedInput, normalize(u.name))
                        }))
                        .filter(s => s.similarity > 0.3)
                        .sort((a, b) => b.similarity - a.similarity)
                        .slice(0, 3)
                        .map(s => s.name);
                    
                    let errorMsg = `No se encontró el fiscal "${fiscalNombre}"`;
                    if (suggestions.length > 0) {
                        errorMsg += `\n      💡 Sugerencias: ${suggestions.join(', ')}`;
                    }
                    throw new Error(errorMsg);
                }
                
                // Buscar parroquia
                const parroquia = await findParishByName(parroquiaNombre);
                if (!parroquia) {
                    throw new Error(`Fila ${rowNum}: No se encontró la parroquia "${parroquiaNombre}"`);
                }
                
                // Buscar categoría (si no se encuentra, usar la primera disponible)
                const categoria = await findCategoryByName();
                if (!categoria) {
                    throw new Error(`Fila ${rowNum}: No hay categorías disponibles en la base de datos`);
                }
                
                // Mapear proceso y tipo de contrato
                const process = mapProcess(programa);
                const contract_type = mapContractType(calificacion);
                
                // Fecha de emisión: usar 2026-01-01 por defecto (o la fecha actual si es más reciente)
                const emition_date = new Date('2026-01-01');
                
                // Crear el contribuyente
                console.log(`[${rowNum}/${limit}] Creando: ${nombre} (${rif}) - Fiscal: ${fiscal.name}`);
                
                await createTaxpayerExcel({
                    providenceNum: BigInt(providenceNum),
                    process: process as any,
                    name: nombre,
                    rif: rif,
                    contract_type: contract_type as any,
                    officerName: fiscal.name, // Usar el nombre encontrado en la BD
                    address: direccion || 'Caracas',
                    emition_date: emition_date,
                    categoryId: categoria.id,
                    parishId: parroquia.id,
                });
                
                successCount++;
                console.log(`   ✅ Creado exitosamente\n`);
                
            } catch (error: any) {
                errorCount++;
                const errorMsg = `Fila ${rowNum}: ${error.message}`;
                errors.push(errorMsg);
                console.error(`   ❌ Error: ${errorMsg}\n`);
            }
        }
        
        // Resumen
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 RESUMEN DE IMPORTACIÓN`);
        console.log(`${'='.repeat(60)}`);
        console.log(`✅ Exitosos: ${successCount}`);
        console.log(`❌ Errores: ${errorCount}`);
        console.log(`📋 Total procesados: ${limit}`);
        
        if (errors.length > 0) {
            console.log(`\n⚠️  Errores encontrados:`);
            errors.forEach((err, idx) => {
                console.log(`   ${idx + 1}. ${err}`);
            });
        }
        
        console.log(`\n✅ Importación completada`);
        
    } catch (error: any) {
        console.error('❌ Error fatal al leer el Excel:', error.message);
        console.error(error);
        throw error;
    }
}

// Ejecutar
importTaxpayers()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Error fatal:', error);
        process.exit(1);
    });
