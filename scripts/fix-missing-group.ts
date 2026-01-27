import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db.server';

/**
 * Script para corregir usuarios sin grupo asignado
 */

async function fixMissingGroups() {
    try {
        console.log('🔧 Corrigiendo usuarios sin grupo...\n');
        
        // Buscar usuarios sin grupo
        const usersWithoutGroup = await db.user.findMany({
            where: {
                role: { in: ['FISCAL', 'SUPERVISOR'] },
                groupId: null,
            },
            select: {
                id: true,
                name: true,
                role: true,
            }
        });
        
        console.log(`📋 Usuarios sin grupo encontrados: ${usersWithoutGroup.length}\n`);
        
        if (usersWithoutGroup.length === 0) {
            console.log('✅ No hay usuarios sin grupo que corregir');
            return;
        }
        
        // Obtener todos los grupos disponibles
        const groups = await db.fiscalGroup.findMany({
            select: {
                id: true,
                name: true,
                _count: {
                    select: {
                        members: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });
        
        console.log(`📋 Grupos disponibles: ${groups.length}\n`);
        
        // Asignar usuarios sin grupo al primer grupo disponible (o crear lógica más específica)
        for (const user of usersWithoutGroup) {
            // Intentar encontrar un grupo apropiado basado en el nombre o asignar al primero
            let targetGroup = groups[0]; // Por defecto, primer grupo
            
            // Si es supervisor, buscar un grupo que no tenga muchos miembros
            if (user.role === 'SUPERVISOR') {
                const groupWithFewerMembers = groups
                    .sort((a, b) => a._count.members - b._count.members)[0];
                targetGroup = groupWithFewerMembers;
            }
            
            await db.user.update({
                where: { id: user.id },
                data: { groupId: targetGroup.id }
            });
            
            console.log(`✅ ${user.name} (${user.role}) asignado al grupo: ${targetGroup.name}`);
        }
        
        console.log(`\n✅ Corrección completada`);
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

fixMissingGroups();
