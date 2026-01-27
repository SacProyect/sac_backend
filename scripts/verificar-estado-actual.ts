import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db.server';

/**
 * Script de VERIFICACIÓN - Solo muestra el estado actual sin hacer cambios
 * 
 * Este script NO modifica nada, solo muestra información para verificar el estado
 */

async function verificarEstadoActual() {
    try {
        console.log('🔍 VERIFICACIÓN DEL ESTADO ACTUAL DEL SISTEMA\n');
        console.log('='.repeat(80));
        
        // ============================================================
        // 1. VERIFICAR CONTRIBUYENTES DEL 2026
        // ============================================================
        console.log('\n📊 1. CONTRIBUYENTES DEL 2026\n');
        console.log('-'.repeat(80));
        
        const start2026 = new Date('2026-01-01T00:00:00.000Z');
        const end2026 = new Date('2027-01-01T00:00:00.000Z');
        
        const taxpayers2026 = await db.taxpayer.findMany({
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
                created_at: true,
            },
            orderBy: {
                emition_date: 'asc',
            }
        });
        
        console.log(`📋 Total de contribuyentes del 2026: ${taxpayers2026.length}`);
        
        // Verificar fechas
        const fechasIncorrectas = taxpayers2026.filter(t => {
            const fecha = new Date(t.emition_date);
            return fecha.getUTCFullYear() !== 2026;
        });
        
        if (fechasIncorrectas.length > 0) {
            console.log(`\n⚠️  Contribuyentes con fechas incorrectas: ${fechasIncorrectas.length}`);
            fechasIncorrectas.forEach(t => {
                console.log(`   - ${t.name} (${t.rif}): ${t.emition_date.toISOString()}`);
            });
        } else {
            console.log(`\n✅ Todas las fechas están en el año 2026`);
        }
        
        // ============================================================
        // 2. VERIFICAR DUPLICADOS
        // ============================================================
        console.log('\n\n📊 2. VERIFICACIÓN DE DUPLICADOS\n');
        console.log('-'.repeat(80));
        
        // Agrupar por RIF + año fiscal
        const groupedByRifAndYear = new Map<string, typeof taxpayers2026>();
        
        for (const taxpayer of taxpayers2026) {
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
        
        if (duplicates.length > 0) {
            console.log(`🔴 Grupos con duplicados encontrados: ${duplicates.length}\n`);
            
            for (const [key, group] of duplicates) {
                console.log(`\n📋 Duplicados para ${key}:`);
                group.forEach((t, idx) => {
                    console.log(`   ${idx + 1}. ${t.name} (ID: ${t.id}, Fecha: ${t.emition_date.toISOString()})`);
                });
            }
        } else {
            console.log(`✅ No se encontraron duplicados`);
        }
        
        // ============================================================
        // 3. RESUMEN FINAL
        // ============================================================
        console.log('\n\n📊 3. RESUMEN FINAL\n');
        console.log('='.repeat(80));
        console.log(`   - Contribuyentes 2026: ${taxpayers2026.length}`);
        console.log(`   - Fechas incorrectas: ${fechasIncorrectas.length}`);
        console.log(`   - Duplicados encontrados: ${duplicates.length}`);
        console.log('='.repeat(80));
        
        if (fechasIncorrectas.length === 0 && duplicates.length === 0) {
            console.log('\n✅ ESTADO: TODO CORRECTO - No se requiere limpieza');
        } else {
            console.log('\n⚠️  ESTADO: Se encontraron problemas que pueden requerir limpieza');
            console.log('   Si hay duplicados, puedes ejecutar: fix-duplicates-and-dates-final.ts');
            console.log('   Si hay fechas incorrectas, puedes ejecutar: fix-dates-2026-final.ts');
        }
        
        console.log('\n');
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error);
        throw error;
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

verificarEstadoActual();
