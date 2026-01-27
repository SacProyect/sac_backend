import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db.server';

/**
 * AUDITORÍA COMPLETA DEL SISTEMA SAC
 * 
 * Este script verifica:
 * 1. Integridad de grupos y supervisores
 * 2. Duplicados en contribuyentes
 * 3. Datos del 2026
 * 4. Relaciones entre usuarios, grupos y supervisores
 */

async function auditSystem() {
    try {
        console.log('🔍 INICIANDO AUDITORÍA COMPLETA DEL SISTEMA\n');
        console.log('='.repeat(80));
        
        // ============================================================
        // 1. AUDITORÍA DE GRUPOS Y SUPERVISORES
        // ============================================================
        console.log('\n📊 1. ESTATUS DE GRUPOS Y SUPERVISORES\n');
        console.log('-'.repeat(80));
        
        const groups = await db.fiscalGroup.findMany({
            include: {
                coordinator: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                    }
                },
                members: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        supervisorId: true,
                        supervisor: {
                            select: {
                                id: true,
                                name: true,
                            }
                        },
                        _count: {
                            select: {
                                taxpayer: {
                                    where: {
                                        status: true,
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
        
        console.log(`📋 Total de grupos: ${groups.length}\n`);
        
        let usersWithoutGroup = 0;
        let usersWithoutSupervisor = 0;
        const groupReport: any[] = [];
        
        groups.forEach((group, idx) => {
            console.log(`\n${idx + 1}. Grupo: ${group.name}`);
            console.log(`   Coordinador: ${group.coordinator?.name || 'SIN COORDINADOR'} (${group.coordinator?.role || 'N/A'})`);
            console.log(`   Miembros: ${group.members.length}`);
            
            const groupData: any = {
                grupo: group.name,
                coordinador: group.coordinator?.name || 'SIN COORDINADOR',
                miembros: []
            };
            
            group.members.forEach((member, mIdx) => {
                const supervisorName = member.supervisor?.name || 'SIN SUPERVISOR';
                const casosCount = member._count.taxpayer;
                
                console.log(`   ${mIdx + 1}. ${member.name} (${member.role})`);
                console.log(`      Supervisor: ${supervisorName}`);
                console.log(`      Casos asignados: ${casosCount}`);
                
                if (!member.supervisorId) {
                    usersWithoutSupervisor++;
                }
                
                groupData.miembros.push({
                    nombre: member.name,
                    rol: member.role,
                    supervisor: supervisorName,
                    casos: casosCount
                });
            });
            
            groupReport.push(groupData);
        });
        
        // Verificar usuarios sin grupo
        const allFiscals = await db.user.findMany({
            where: {
                role: { in: ['FISCAL', 'SUPERVISOR'] }
            },
            select: {
                id: true,
                name: true,
                role: true,
                groupId: true,
                supervisorId: true,
                group: {
                    select: {
                        name: true
                    }
                },
                supervisor: {
                    select: {
                        name: true
                    }
                }
            }
        });
        
        const fiscalsWithoutGroup = allFiscals.filter(u => !u.groupId);
        const fiscalsWithoutSupervisor = allFiscals.filter(u => u.role === 'FISCAL' && !u.supervisorId);
        
        console.log(`\n⚠️  PROBLEMAS ENCONTRADOS:`);
        console.log(`   - Fiscales sin grupo: ${fiscalsWithoutGroup.length}`);
        console.log(`   - Fiscales sin supervisor: ${fiscalsWithoutSupervisor.length}`);
        
        if (fiscalsWithoutGroup.length > 0) {
            console.log(`\n   Fiscales sin grupo:`);
            fiscalsWithoutGroup.forEach(f => {
                console.log(`     - ${f.name} (${f.role})`);
            });
        }
        
        if (fiscalsWithoutSupervisor.length > 0) {
            console.log(`\n   Fiscales sin supervisor:`);
            fiscalsWithoutSupervisor.forEach(f => {
                console.log(`     - ${f.name}`);
            });
        }
        
        // ============================================================
        // 2. VERIFICACIÓN DE DUPLICADOS
        // ============================================================
        console.log('\n\n📊 2. VERIFICACIÓN DE DUPLICADOS\n');
        console.log('-'.repeat(80));
        
        const allTaxpayers = await db.taxpayer.findMany({
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
            }
        });
        
        const grouped = new Map<string, any[]>();
        allTaxpayers.forEach(t => {
            const year = new Date(t.emition_date).getUTCFullYear();
            const key = `${t.providenceNum}-${t.process}-${year}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key)!.push(t);
        });
        
        const duplicates = Array.from(grouped.entries()).filter(([_, group]) => group.length > 1);
        
        console.log(`📋 Total de contribuyentes activos: ${allTaxpayers.length}`);
        console.log(`🔴 Grupos con duplicados: ${duplicates.length}`);
        
        if (duplicates.length > 0) {
            console.log(`\n⚠️  Duplicados encontrados:`);
            duplicates.slice(0, 10).forEach(([key, group], idx) => {
                console.log(`   ${idx + 1}. ${key} (${group.length} duplicados)`);
            });
            if (duplicates.length > 10) {
                console.log(`   ... y ${duplicates.length - 10} más`);
            }
        } else {
            console.log(`\n✅ No se encontraron duplicados activos`);
        }
        
        // ============================================================
        // 3. VERIFICACIÓN DE DATOS 2026
        // ============================================================
        console.log('\n\n📊 3. VERIFICACIÓN DE DATOS 2026\n');
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
                name: true,
                emition_date: true,
                officerId: true,
                user: {
                    select: {
                        name: true,
                        group: {
                            select: {
                                name: true
                            }
                        },
                        supervisor: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });
        
        console.log(`📋 Contribuyentes 2026 activos: ${taxpayers2026.length}`);
        
        // Agrupar por fiscal
        const byFiscal = new Map<string, any[]>();
        taxpayers2026.forEach(t => {
            const fiscalName = t.user?.name || 'SIN FISCAL';
            if (!byFiscal.has(fiscalName)) {
                byFiscal.set(fiscalName, []);
            }
            byFiscal.get(fiscalName)!.push(t);
        });
        
        console.log(`👥 Fiscales con casos 2026: ${byFiscal.size}\n`);
        
        console.log(`📋 Distribución por fiscal:`);
        Array.from(byFiscal.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 10)
            .forEach(([fiscal, casos], idx) => {
                const firstCase = casos[0];
                const grupo = firstCase.user?.group?.name || 'SIN GRUPO';
                const supervisor = firstCase.user?.supervisor?.name || 'SIN SUPERVISOR';
                console.log(`   ${idx + 1}. ${fiscal}: ${casos.length} casos`);
                console.log(`      Grupo: ${grupo} | Supervisor: ${supervisor}`);
            });
        
        // Verificar fechas incorrectas
        const wrongDates = taxpayers2026.filter(t => {
            const date = new Date(t.emition_date);
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();
            return year === 2025 && month === 11; // Diciembre 2025
        });
        
        if (wrongDates.length > 0) {
            console.log(`\n⚠️  Contribuyentes con fechas incorrectas (diciembre 2025): ${wrongDates.length}`);
        } else {
            console.log(`\n✅ Todas las fechas están correctas`);
        }
        
        // ============================================================
        // 4. VERIFICACIÓN DE INTEGRIDAD DE RELACIONES
        // ============================================================
        console.log('\n\n📊 4. INTEGRIDAD DE RELACIONES\n');
        console.log('-'.repeat(80));
        
        const taxpayersWithIssues = await db.taxpayer.findMany({
            where: {
                status: true,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        groupId: true,
                        supervisorId: true,
                        group: {
                            select: {
                                name: true
                            }
                        },
                        supervisor: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            take: 100,
        });
        
        const withoutOfficer = taxpayersWithIssues.filter(t => !t.officerId);
        const withoutGroup = taxpayersWithIssues.filter(t => t.user && !t.user.groupId);
        const withoutSupervisor = taxpayersWithIssues.filter(t => 
            t.user && t.user.role === 'FISCAL' && !t.user.supervisorId
        );
        
        console.log(`📋 Verificando ${taxpayersWithIssues.length} contribuyentes (muestra)...`);
        console.log(`   - Sin fiscal asignado: ${withoutOfficer.length}`);
        console.log(`   - Fiscal sin grupo: ${withoutGroup.length}`);
        console.log(`   - Fiscal sin supervisor: ${withoutSupervisor.length}`);
        
        // ============================================================
        // RESUMEN FINAL
        // ============================================================
        console.log('\n\n' + '='.repeat(80));
        console.log('📋 RESUMEN DE AUDITORÍA');
        console.log('='.repeat(80));
        
        console.log(`\n✅ ESTADO GENERAL:`);
        console.log(`   - Grupos: ${groups.length}`);
        console.log(`   - Contribuyentes activos: ${allTaxpayers.length}`);
        console.log(`   - Contribuyentes 2026: ${taxpayers2026.length}`);
        console.log(`   - Duplicados activos: ${duplicates.length}`);
        
        console.log(`\n⚠️  PROBLEMAS ENCONTRADOS:`);
        console.log(`   - Fiscales sin grupo: ${fiscalsWithoutGroup.length}`);
        console.log(`   - Fiscales sin supervisor: ${fiscalsWithoutSupervisor.length}`);
        console.log(`   - Contribuyentes sin fiscal: ${withoutOfficer.length}`);
        
        console.log(`\n✅ VERIFICACIÓN 2026:`);
        console.log(`   - Contribuyentes 2026 esperados: 47`);
        console.log(`   - Contribuyentes 2026 encontrados: ${taxpayers2026.length}`);
        if (taxpayers2026.length === 47) {
            console.log(`   ✅ CORRECTO: Todos los 47 contribuyentes están presentes`);
        } else {
            console.log(`   ⚠️  DIFERENCIA: Faltan ${47 - taxpayers2026.length} contribuyentes`);
        }
        
        // Guardar reporte en archivo
        const report = {
            fecha: new Date().toISOString(),
            grupos: groupReport,
            estadisticas: {
                totalGrupos: groups.length,
                totalContribuyentes: allTaxpayers.length,
                contribuyentes2026: taxpayers2026.length,
                duplicados: duplicates.length,
                fiscalesSinGrupo: fiscalsWithoutGroup.length,
                fiscalesSinSupervisor: fiscalsWithoutSupervisor.length,
            },
            problemas: {
                fiscalesSinGrupo: fiscalsWithoutGroup.map(f => ({
                    nombre: f.name,
                    rol: f.role
                })),
                fiscalesSinSupervisor: fiscalsWithoutSupervisor.map(f => ({
                    nombre: f.name
                }))
            }
        };
        
        const fs = require('fs');
        const reportPath = path.join(__dirname, '../../AUDITORIA_SISTEMA.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Reporte completo guardado en: ${reportPath}`);
        
        console.log('\n✅ Auditoría completada\n');
        
    } catch (error: any) {
        console.error('❌ Error en auditoría:', error.message);
        console.error(error);
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

auditSystem();
