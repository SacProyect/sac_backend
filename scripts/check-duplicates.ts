import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db-server';

async function checkDuplicates() {
    try {
        console.log('🔍 Verificando duplicados...\n');
        
        // Buscar duplicados por número de providencia y proceso en el mismo año
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
            },
            orderBy: {
                created_at: 'desc',
            }
        });
        
        // Agrupar por providencia + proceso + año
        const grouped = new Map<string, any[]>();
        
        taxpayers.forEach(t => {
            const year = new Date(t.emition_date).getFullYear();
            const key = `${t.providenceNum}-${t.process}-${year}`;
            
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(t);
        });
        
        // Encontrar duplicados
        const duplicates: any[] = [];
        grouped.forEach((group, key) => {
            if (group.length > 1) {
                duplicates.push({
                    key,
                    count: group.length,
                    items: group,
                });
            }
        });
        
        console.log(`📊 Total de contribuyentes: ${taxpayers.length}`);
        console.log(`🔴 Duplicados encontrados: ${duplicates.length}\n`);
        
        if (duplicates.length > 0) {
            console.log('📋 Detalles de duplicados:\n');
            duplicates.forEach((dup, idx) => {
                console.log(`${idx + 1}. ${dup.key} (${dup.count} duplicados)`);
                dup.items.forEach((item: any, i: number) => {
                    const date = new Date(item.emition_date).toISOString().split('T')[0];
                    const created = new Date(item.created_at).toISOString().split('T')[0];
                    console.log(`   ${i + 1}. ID: ${item.id} | Nombre: ${item.name} | Fecha: ${date} | Creado: ${created}`);
                });
                console.log('');
            });
        }
        
        // Verificar fechas incorrectas (diciembre 2025 en lugar de enero 2026)
        console.log('\n🔍 Verificando fechas incorrectas...\n');
        const start2026 = new Date('2026-01-01');
        const end2026 = new Date('2027-01-01');
        
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
                name: true,
                emition_date: true,
            },
        });
        
        console.log(`✅ Contribuyentes con fecha 2026 correcta: ${taxpayers2026.length}`);
        
        // Buscar contribuyentes que deberían ser 2026 pero están en diciembre 2025
        const startDec2025 = new Date('2025-12-31');
        const endDec2025 = new Date('2026-01-02');
        
        const wrongDates = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: startDec2025,
                    lt: endDec2025,
                },
                status: true,
            },
            select: {
                id: true,
                name: true,
                emition_date: true,
                created_at: true,
            },
        });
        
        console.log(`⚠️  Contribuyentes con fecha cerca de 2026 (posible error): ${wrongDates.length}`);
        if (wrongDates.length > 0) {
            console.log('\n📋 Fechas sospechosas:');
            wrongDates.slice(0, 10).forEach((t, idx) => {
                const date = new Date(t.emition_date).toISOString();
                console.log(`   ${idx + 1}. ${t.name} - Fecha: ${date}`);
            });
        }
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

checkDuplicates();
