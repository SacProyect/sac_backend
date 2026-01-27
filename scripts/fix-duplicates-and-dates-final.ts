import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db.server';

/**
 * Script CRÍTICO para eliminar duplicados y corregir fechas del 2026
 * 
 * Lógica:
 * 1. Encuentra duplicados por RIF + año fiscal (emition_date)
 * 2. Mantiene el registro más reciente (por updated_at)
 * 3. ELIMINA los duplicados más antiguos
 * 4. Corrige fechas de contribuyentes creados en 2025 pero que deberían ser 2026
 */

function normalize(str: string): string {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

async function fixDuplicatesAndDates() {
    try {
        console.log('🔧 INICIANDO LIMPIEZA CRÍTICA DE DUPLICADOS Y FECHAS\n');
        console.log('='.repeat(80));
        
        // ============================================================
        // 1. ENCONTRAR Y ELIMINAR DUPLICADOS POR RIF + AÑO FISCAL
        // ============================================================
        console.log('\n📊 1. BUSCANDO DUPLICADOS POR RIF + AÑO FISCAL\n');
        console.log('-'.repeat(80));
        
        const allTaxpayers = await db.taxpayer.findMany({
            where: {
                status: true, // Solo activos
            },
            select: {
                id: true,
                rif: true,
                name: true,
                emition_date: true,
                created_at: true,
                updated_at: true,
                providenceNum: true,
                process: true,
            },
            orderBy: {
                updated_at: 'desc', // Más reciente primero
            }
        });
        
        console.log(`📋 Total de contribuyentes activos: ${allTaxpayers.length}`);
        
        // Agrupar por RIF + año fiscal
        const groupedByRifAndYear = new Map<string, typeof allTaxpayers>();
        
        for (const taxpayer of allTaxpayers) {
            const fiscalYear = new Date(taxpayer.emition_date).getUTCFullYear();
            const key = `${taxpayer.rif}-${fiscalYear}`;
            
            if (!groupedByRifAndYear.has(key)) {
                groupedByRifAndYear.set(key, []);
            }
            groupedByRifAndYear.get(key)!.push(taxpayer);
        }
        
        // Encontrar duplicados
        const duplicates = Array.from(groupedByRifAndYear.entries())
            .filter(([_, group]) => group.length > 1);
        
        console.log(`🔴 Grupos con duplicados encontrados: ${duplicates.length}\n`);
        
        let duplicatesDeleted = 0;
        const duplicatesToDelete: string[] = [];
        
        for (const [key, group] of duplicates) {
            // Ordenar por updated_at descendente (más reciente primero)
            group.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
            
            const keptTaxpayer = group[0]; // El más reciente
            const duplicatesToRemove = group.slice(1); // Los demás
            
            console.log(`\n📋 Duplicados encontrados para ${key}:`);
            console.log(`   ✅ MANTENER: ${keptTaxpayer.name} (ID: ${keptTaxpayer.id}, Actualizado: ${keptTaxpayer.updated_at.toISOString()})`);
            
            for (const duplicate of duplicatesToRemove) {
                console.log(`   ❌ ELIMINAR: ${duplicate.name} (ID: ${duplicate.id}, Actualizado: ${duplicate.updated_at.toISOString()})`);
                duplicatesToDelete.push(duplicate.id);
                duplicatesDeleted++;
            }
        }
        
        // ELIMINAR duplicados
        if (duplicatesToDelete.length > 0) {
            console.log(`\n🗑️  Eliminando ${duplicatesToDelete.length} duplicados...`);
            
            for (const id of duplicatesToDelete) {
                await db.taxpayer.delete({
                    where: { id }
                });
            }
            
            console.log(`✅ ${duplicatesDeleted} duplicados eliminados permanentemente`);
        } else {
            console.log(`\n✅ No se encontraron duplicados para eliminar`);
        }
        
        // ============================================================
        // 2. CORREGIR FECHAS DE CONTRIBUYENTES DEL 2026
        // ============================================================
        console.log('\n\n📊 2. CORRIGIENDO FECHAS DEL 2026\n');
        console.log('-'.repeat(80));
        
        const start2025Dec = new Date('2025-12-31T00:00:00.000Z');
        const end2025Dec = new Date('2026-01-01T00:00:00.000Z');
        const start2026 = new Date('2026-01-01T00:00:00.000Z');
        const end2026 = new Date('2027-01-01T00:00:00.000Z');
        
        // Buscar contribuyentes con emition_date en diciembre 2025 pero creados en 2026
        const wrongDates = await db.taxpayer.findMany({
            where: {
                OR: [
                    {
                        // Caso 1: emition_date en diciembre 2025 pero created_at en 2026
                        emition_date: {
                            gte: start2025Dec,
                            lt: end2025Dec,
                        },
                        created_at: {
                            gte: start2026,
                        },
                    },
                    {
                        // Caso 2: emition_date antes de 2026 pero debería ser 2026
                        emition_date: {
                            lt: start2026,
                        },
                        created_at: {
                            gte: start2026,
                        },
                    }
                ],
                status: true,
            },
            select: {
                id: true,
                name: true,
                rif: true,
                emition_date: true,
                created_at: true,
            }
        });
        
        console.log(`📋 Contribuyentes con fechas incorrectas encontrados: ${wrongDates.length}\n`);
        
        if (wrongDates.length > 0) {
            let correctedCount = 0;
            for (const taxpayer of wrongDates) {
                const oldDate = taxpayer.emition_date.toISOString();
                await db.taxpayer.update({
                    where: { id: taxpayer.id },
                    data: {
                        emition_date: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0))
                    }
                });
                correctedCount++;
                console.log(`✅ ${taxpayer.name} (${taxpayer.rif}): ${oldDate} → 2026-01-01`);
            }
            console.log(`\n✅ ${correctedCount} fechas corregidas`);
        } else {
            console.log(`✅ No hay fechas incorrectas que corregir`);
        }
        
        // ============================================================
        // 3. VERIFICACIÓN FINAL
        // ============================================================
        console.log('\n\n📊 3. VERIFICACIÓN FINAL\n');
        console.log('-'.repeat(80));
        
        const final2026Taxpayers = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: start2026,
                    lt: end2026,
                },
                status: true,
            },
            select: {
                id: true,
                rif: true,
                name: true,
                emition_date: true,
            }
        });
        
        console.log(`📋 Contribuyentes del 2026 después de la limpieza: ${final2026Taxpayers.length}`);
        
        // Verificar duplicados restantes
        const rifCounts = new Map<string, number>();
        final2026Taxpayers.forEach(t => {
            const count = rifCounts.get(t.rif) || 0;
            rifCounts.set(t.rif, count + 1);
        });
        
        const remainingDuplicates = Array.from(rifCounts.entries())
            .filter(([_, count]) => count > 1);
        
        if (remainingDuplicates.length > 0) {
            console.log(`\n⚠️  Duplicados restantes encontrados:`);
            remainingDuplicates.forEach(([rif, count]) => {
                console.log(`   - RIF ${rif}: ${count} registros`);
            });
        } else {
            console.log(`\n✅ No hay duplicados restantes`);
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ LIMPIEZA COMPLETADA');
        console.log('='.repeat(80));
        console.log(`   - Duplicados eliminados: ${duplicatesDeleted}`);
        console.log(`   - Fechas corregidas: ${wrongDates.length}`);
        console.log(`   - Contribuyentes 2026 finales: ${final2026Taxpayers.length}`);
        console.log('='.repeat(80) + '\n');
        
    } catch (error: any) {
        console.error('❌ Error crítico:', error.message);
        console.error(error);
        throw error;
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

fixDuplicatesAndDates();
