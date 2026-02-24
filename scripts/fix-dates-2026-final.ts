import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db-server';

/**
 * Script CRÍTICO para corregir fechas del 2026 y eliminar duplicados restantes
 * 
 * Lógica:
 * 1. Encuentra todos los contribuyentes del 2026 (por emition_date o created_at en 2026)
 * 2. Corrige sus fechas a mediodía UTC (2026-01-01T12:00:00Z) para evitar problemas de zona horaria
 * 3. Elimina duplicados restantes por RIF + año fiscal
 */

async function fixDatesAndDuplicates2026() {
    try {
        console.log('🔧 INICIANDO CORRECCIÓN FINAL DE FECHAS Y DUPLICADOS 2026\n');
        console.log('='.repeat(80));
        
        // ============================================================
        // 1. IDENTIFICAR CONTRIBUYENTES DEL 2026
        // ============================================================
        console.log('\n📊 1. IDENTIFICANDO CONTRIBUYENTES DEL 2026\n');
        console.log('-'.repeat(80));
        
        const start2026 = new Date('2026-01-01T00:00:00.000Z');
        const end2026 = new Date('2027-01-01T00:00:00.000Z');
        const start2025Dec = new Date('2025-12-31T00:00:00.000Z');
        
        // Buscar contribuyentes que deberían ser del 2026
        // - Creados en 2026 pero con emition_date en 2025
        // - O con emition_date que debería ser 2026 pero está en diciembre 2025
        const candidates2026 = await db.taxpayer.findMany({
            where: {
                OR: [
                    {
                        // Caso 1: Creados en 2026
                        created_at: {
                            gte: start2026,
                        },
                        status: true,
                    },
                    {
                        // Caso 2: emition_date cerca del cambio de año (diciembre 2025 o enero 2026)
                        emition_date: {
                            gte: start2025Dec,
                            lt: end2026,
                        },
                        status: true,
                    }
                ]
            },
            select: {
                id: true,
                rif: true,
                name: true,
                emition_date: true,
                created_at: true,
                updated_at: true,
            },
            orderBy: {
                created_at: 'desc',
            }
        });
        
        console.log(`📋 Candidatos encontrados: ${candidates2026.length}`);
        
        // Filtrar solo los que realmente deberían ser del 2026
        // (creados en 2026 o con emition_date que debería ser 2026)
        const taxpayers2026 = candidates2026.filter(t => {
            const createdYear = new Date(t.created_at).getUTCFullYear();
            const emitionYear = new Date(t.emition_date).getUTCFullYear();
            return createdYear === 2026 || (emitionYear >= 2025 && createdYear >= 2026);
        });
        
        console.log(`📋 Contribuyentes del 2026 identificados: ${taxpayers2026.length}\n`);
        
        // ============================================================
        // 2. CORREGIR FECHAS A MEDIODÍA UTC
        // ============================================================
        console.log('\n📊 2. CORRIGIENDO FECHAS A MEDIODÍA UTC\n');
        console.log('-'.repeat(80));
        
        // Fecha segura: mediodía UTC del 1 de enero 2026
        const safeDate2026 = new Date(Date.UTC(2026, 0, 1, 12, 0, 0, 0));
        
        let correctedCount = 0;
        for (const taxpayer of taxpayers2026) {
            const oldEmitionDate = taxpayer.emition_date.toISOString();
            const oldCreatedAt = taxpayer.created_at.toISOString();
            
            // Solo corregir si la fecha no está ya en mediodía UTC del 2026
            const currentEmitionYear = new Date(taxpayer.emition_date).getUTCFullYear();
            const currentEmitionHour = new Date(taxpayer.emition_date).getUTCHours();
            
            if (currentEmitionYear !== 2026 || currentEmitionHour !== 12) {
                await db.taxpayer.update({
                    where: { id: taxpayer.id },
                    data: {
                        emition_date: safeDate2026,
                        // También actualizar created_at si fue creado en 2026 pero tiene fecha incorrecta
                        created_at: taxpayer.created_at < start2026 
                            ? safeDate2026 
                            : taxpayer.created_at,
                    }
                });
                correctedCount++;
                console.log(`✅ ${taxpayer.name} (${taxpayer.rif}):`);
                console.log(`   emition_date: ${oldEmitionDate} → ${safeDate2026.toISOString()}`);
                if (taxpayer.created_at < start2026) {
                    console.log(`   created_at: ${oldCreatedAt} → ${safeDate2026.toISOString()}`);
                }
            }
        }
        
        console.log(`\n✅ ${correctedCount} fechas corregidas`);
        
        // ============================================================
        // 3. ELIMINAR DUPLICADOS RESTANTES
        // ============================================================
        console.log('\n\n📊 3. ELIMINANDO DUPLICADOS RESTANTES\n');
        console.log('-'.repeat(80));
        
        // Obtener todos los contribuyentes del 2026 después de la corrección
        const final2026Taxpayers = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),
                    lt: end2026,
                },
                status: true,
            },
            select: {
                id: true,
                rif: true,
                name: true,
                emition_date: true,
                updated_at: true,
            },
            orderBy: {
                updated_at: 'desc',
            }
        });
        
        console.log(`📋 Contribuyentes del 2026 después de corrección: ${final2026Taxpayers.length}`);
        
        // Agrupar por RIF
        const groupedByRif = new Map<string, typeof final2026Taxpayers>();
        
        for (const taxpayer of final2026Taxpayers) {
            if (!groupedByRif.has(taxpayer.rif)) {
                groupedByRif.set(taxpayer.rif, []);
            }
            groupedByRif.get(taxpayer.rif)!.push(taxpayer);
        }
        
        // Encontrar duplicados
        const duplicates = Array.from(groupedByRif.entries())
            .filter(([_, group]) => group.length > 1);
        
        console.log(`🔴 Grupos con duplicados encontrados: ${duplicates.length}\n`);
        
        let duplicatesDeleted = 0;
        const duplicatesToDelete: string[] = [];
        
        for (const [rif, group] of duplicates) {
            // Ordenar por updated_at descendente (más reciente primero)
            group.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
            
            const keptTaxpayer = group[0]; // El más reciente
            const duplicatesToRemove = group.slice(1); // Los demás
            
            console.log(`\n📋 Duplicados encontrados para RIF ${rif}:`);
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
        // 4. VERIFICACIÓN FINAL
        // ============================================================
        console.log('\n\n📊 4. VERIFICACIÓN FINAL\n');
        console.log('-'.repeat(80));
        
        const verified2026Taxpayers = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0)),
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
        
        console.log(`📋 Contribuyentes del 2026 finales: ${verified2026Taxpayers.length}`);
        
        // Verificar que todas las fechas estén en mediodía UTC
        const wrongDates = verified2026Taxpayers.filter(t => {
            const date = new Date(t.emition_date);
            return date.getUTCFullYear() !== 2026 || date.getUTCHours() !== 12;
        });
        
        if (wrongDates.length > 0) {
            console.log(`\n⚠️  Contribuyentes con fechas incorrectas: ${wrongDates.length}`);
            wrongDates.forEach(t => {
                console.log(`   - ${t.name} (${t.rif}): ${t.emition_date.toISOString()}`);
            });
        } else {
            console.log(`\n✅ Todas las fechas están correctas (mediodía UTC del 2026)`);
        }
        
        // Verificar duplicados restantes
        const rifCounts = new Map<string, number>();
        verified2026Taxpayers.forEach(t => {
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
        console.log('✅ CORRECCIÓN COMPLETADA');
        console.log('='.repeat(80));
        console.log(`   - Fechas corregidas: ${correctedCount}`);
        console.log(`   - Duplicados eliminados: ${duplicatesDeleted}`);
        console.log(`   - Contribuyentes 2026 finales: ${verified2026Taxpayers.length}`);
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

fixDatesAndDuplicates2026();
