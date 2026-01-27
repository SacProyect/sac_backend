import * as dotenv from 'dotenv';
import * as path from 'path';

// Cargar variables de entorno
dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db.server';

async function verifyTaxpayers() {
    try {
        console.log('🔍 Verificando contribuyentes del 2026...\n');
        
        // Verificar contribuyentes del 2026
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
                officerId: true,
                user: {
                    select: {
                        name: true,
                        role: true,
                    }
                }
            },
            take: 10,
        });
        
        console.log(`📊 Total de contribuyentes 2026 encontrados: ${taxpayers2026.length}`);
        console.log('\n📋 Primeros 10 contribuyentes:');
        taxpayers2026.forEach((t, idx) => {
            console.log(`   ${idx + 1}. ${t.name} - Fiscal: ${t.user?.name || 'Sin fiscal'} - Fecha: ${t.emition_date.toISOString().split('T')[0]}`);
        });
        
        // Verificar fiscales con casos del 2026
        const fiscalsWith2026Cases = await db.user.findMany({
            where: {
                role: { in: ['FISCAL', 'SUPERVISOR'] },
                taxpayer: {
                    some: {
                        emition_date: {
                            gte: start2026,
                            lt: end2026,
                        },
                        status: true,
                    }
                }
            },
            select: {
                id: true,
                name: true,
                role: true,
                _count: {
                    select: {
                        taxpayer: {
                            where: {
                                emition_date: {
                                    gte: start2026,
                                    lt: end2026,
                                },
                                status: true,
                            }
                        }
                    }
                }
            },
            take: 10,
        });
        
        console.log(`\n👥 Fiscales con casos del 2026: ${fiscalsWith2026Cases.length}`);
        console.log('\n📋 Primeros 10 fiscales:');
        fiscalsWith2026Cases.forEach((f, idx) => {
            console.log(`   ${idx + 1}. ${f.name} (${f.role}) - Casos: ${f._count.taxpayer}`);
        });
        
        // Contar total
        const total2026 = await db.taxpayer.count({
            where: {
                emition_date: {
                    gte: start2026,
                    lt: end2026,
                },
                status: true,
            }
        });
        
        console.log(`\n✅ Total de contribuyentes 2026 activos: ${total2026}`);
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

verifyTaxpayers();
