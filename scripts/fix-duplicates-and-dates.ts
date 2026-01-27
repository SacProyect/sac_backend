import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db.server';

/**
 * Script para:
 * 1. Eliminar duplicados (dejar el más reciente)
 * 2. Corregir fechas que están en diciembre 2025 cuando deberían ser enero 2026
 * 3. Restaurar rol de Gabriel Longa a ADMIN
 */

async function fixIssues() {
    try {
        console.log('🔧 Iniciando correcciones...\n');
        
        // 1. RESTAURAR ROL DE GABRIEL LONGA A ADMIN
        console.log('1️⃣ Restaurando rol de Gabriel Longa a ADMIN...');
        const allUsers = await db.user.findMany();
        const gabriel = allUsers.find(u => 
            u.name.toUpperCase().includes('GABRIEL') && 
            u.name.toUpperCase().includes('LONGA')
        );
        
        if (gabriel) {
            await db.user.update({
                where: { id: gabriel.id },
                data: { role: 'ADMIN' }
            });
            console.log(`   ✅ Rol de "${gabriel.name}" restaurado a ADMIN\n`);
        } else {
            console.log('   ⚠️  No se encontró a Gabriel Longa\n');
        }
        
        // 2. CORREGIR FECHAS (diciembre 2025 -> enero 2026)
        console.log('2️⃣ Corrigiendo fechas incorrectas...');
        const startDec2025 = new Date('2025-12-31T00:00:00.000Z');
        const endJan2026 = new Date('2026-01-02T00:00:00.000Z');
        const correctDate2026 = new Date('2026-01-01T00:00:00.000Z');
        
        // Buscar contribuyentes con fechas entre 31 dic 2025 y 2 ene 2026
        const wrongDates = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: startDec2025,
                    lt: endJan2026,
                },
                status: true,
            },
            select: {
                id: true,
                name: true,
                emition_date: true,
            },
        });
        
        console.log(`   📋 Encontrados ${wrongDates.length} contribuyentes con fechas sospechosas`);
        
        let fixedDates = 0;
        for (const taxpayer of wrongDates) {
            const dateYear = new Date(taxpayer.emition_date).getUTCFullYear();
            const dateMonth = new Date(taxpayer.emition_date).getUTCMonth();
            const dateDay = new Date(taxpayer.emition_date).getUTCDate();
            
            // Si la fecha es diciembre 2025 o enero 2026 pero debería ser 2026-01-01
            if (dateYear === 2025 && dateMonth === 11) {
                // Diciembre 2025 -> corregir a enero 2026
                await db.taxpayer.update({
                    where: { id: taxpayer.id },
                    data: { emition_date: correctDate2026 }
                });
                fixedDates++;
            } else if (dateYear === 2026 && dateMonth === 0 && dateDay === 1) {
                // Ya está correcto (enero 1, 2026)
                continue;
            }
        }
        
        console.log(`   ✅ ${fixedDates} fechas corregidas a 2026-01-01\n`);
        
        // 3. ELIMINAR DUPLICADOS
        console.log('3️⃣ Eliminando duplicados...');
        
        const taxpayers = await db.taxpayer.findMany({
            where: {
                status: true,
            },
            select: {
                id: true,
                providenceNum: true,
                process: true,
                name: true,
                emition_date: true,
                created_at: true,
                officerId: true,
                rif: true,
            },
            orderBy: {
                created_at: 'desc',
            }
        });
        
        // Agrupar por providencia + proceso + año
        const grouped = new Map<string, any[]>();
        
        taxpayers.forEach(t => {
            const year = new Date(t.emition_date).getUTCFullYear();
            const key = `${t.providenceNum}-${t.process}-${year}`;
            
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(t);
        });
        
        // Encontrar y eliminar duplicados
        let deletedCount = 0;
        const duplicatesToDelete: string[] = [];
        
        grouped.forEach((group, key) => {
            if (group.length > 1) {
                // Ordenar por created_at descendente (más reciente primero)
                group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                
                // Mantener el primero (más reciente) y marcar los demás para eliminar
                const toKeep = group[0];
                const toDelete = group.slice(1);
                
                // Verificar que el que vamos a mantener tenga datos completos
                // Si el más reciente no tiene fiscal pero otro sí, mantener el que tiene fiscal
                const withOfficer = group.find(t => t.officerId);
                const bestToKeep = withOfficer && !toKeep.officerId ? withOfficer : toKeep;
                
                // Marcar todos excepto el mejor para eliminar
                toDelete.forEach(item => {
                    if (item.id !== bestToKeep.id) {
                        duplicatesToDelete.push(item.id);
                    }
                });
                
                // Si el mejor no es el más reciente, también eliminar el más reciente si no tiene datos
                if (bestToKeep.id !== toKeep.id && !toKeep.officerId) {
                    duplicatesToDelete.push(toKeep.id);
                }
            }
        });
        
        console.log(`   📋 ${duplicatesToDelete.length} duplicados identificados para eliminar`);
        
        // Eliminar duplicados en lotes para evitar sobrecarga
        const batchSize = 50;
        for (let i = 0; i < duplicatesToDelete.length; i += batchSize) {
            const batch = duplicatesToDelete.slice(i, i + batchSize);
            await Promise.all(
                batch.map(id => 
                    db.taxpayer.update({
                        where: { id },
                        data: { status: false }
                    })
                )
            );
            deletedCount += batch.length;
            console.log(`   ⏳ Procesados ${Math.min(i + batchSize, duplicatesToDelete.length)}/${duplicatesToDelete.length}...`);
        }
        
        console.log(`   ✅ ${deletedCount} duplicados eliminados (marcados como inactivos)\n`);
        
        // 4. VERIFICAR RESULTADOS FINALES
        console.log('4️⃣ Verificando resultados finales...\n');
        
        const final2026 = await db.taxpayer.count({
            where: {
                emition_date: {
                    gte: new Date('2026-01-01T00:00:00.000Z'),
                    lt: new Date('2027-01-01T00:00:00.000Z'),
                },
                status: true,
            }
        });
        
        const finalDuplicates = await db.taxpayer.groupBy({
            by: ['providenceNum', 'process'],
            where: {
                status: true,
                emition_date: {
                    gte: new Date('2026-01-01T00:00:00.000Z'),
                    lt: new Date('2027-01-01T00:00:00.000Z'),
                }
            },
            _count: {
                id: true
            },
            having: {
                id: {
                    _count: {
                        gt: 1
                    }
                }
            }
        });
        
        console.log(`✅ Contribuyentes 2026 activos: ${final2026}`);
        console.log(`✅ Duplicados restantes en 2026: ${finalDuplicates.length}`);
        
        console.log('\n✅ Correcciones completadas');
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

fixIssues();
