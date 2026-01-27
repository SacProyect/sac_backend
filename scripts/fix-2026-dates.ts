import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db.server';

/**
 * Script para corregir fechas de contribuyentes del 2026
 * Asegura que todos los contribuyentes con emition_date en diciembre 2025
 * pero que deberían ser del 2026 sean corregidos
 */

async function fix2026Dates() {
    try {
        console.log('🔧 Corrigiendo fechas de contribuyentes del 2026...\n');
        
        // Buscar contribuyentes creados en 2026 pero con emition_date en 2025
        const start2025 = new Date('2025-12-01T00:00:00.000Z');
        const end2025 = new Date('2026-01-01T00:00:00.000Z');
        const start2026 = new Date('2026-01-01T00:00:00.000Z');
        const end2026 = new Date('2027-01-01T00:00:00.000Z');
        
        // Buscar contribuyentes con emition_date en diciembre 2025 pero creados en 2026
        const wrongDates = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: start2025,
                    lt: end2025,
                },
                created_at: {
                    gte: start2026,
                },
                status: true,
            },
            select: {
                id: true,
                name: true,
                emition_date: true,
                created_at: true,
            }
        });
        
        console.log(`📋 Contribuyentes con fechas incorrectas encontrados: ${wrongDates.length}\n`);
        
        if (wrongDates.length === 0) {
            console.log('✅ No hay fechas incorrectas que corregir');
            return;
        }
        
        // Corregir fechas a 2026-01-01
        let correctedCount = 0;
        for (const taxpayer of wrongDates) {
            await db.taxpayer.update({
                where: { id: taxpayer.id },
                data: {
                    emition_date: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0))
                }
            });
            correctedCount++;
            console.log(`✅ ${taxpayer.name}: ${taxpayer.emition_date.toISOString()} → 2026-01-01`);
        }
        
        console.log(`\n✅ ${correctedCount} fechas corregidas`);
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

fix2026Dates();
