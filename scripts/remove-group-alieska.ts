import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ 
    path: path.resolve(__dirname, '../../.env'),
    override: true 
});

import { db } from '../src/utils/db-server';

/**
 * Script para remover el grupo de Alieska Yepez
 * (Ya no trabaja aquí pero su información debe quedar registrada)
 */

async function removeGroupAlieska() {
    try {
        console.log('🔧 Removiendo grupo de Alieska Yepez...\n');
        
        // Buscar a Alieska Yepez
        const alieska = await db.user.findFirst({
            where: {
                name: {
                    contains: 'Alieska'
                }
            }
        });
        
        if (!alieska) {
            console.log('⚠️  No se encontró a Alieska Yepez');
            return;
        }
        
        console.log(`📋 Usuario encontrado: ${alieska.name} (${alieska.role})`);
        console.log(`   Grupo actual: ${alieska.groupId || 'Sin grupo'}\n`);
        
        // Remover grupo pero mantener la información
        await db.user.update({
            where: { id: alieska.id },
            data: { groupId: null }
        });
        
        console.log(`✅ Grupo removido de ${alieska.name}`);
        console.log(`   ✅ Información del usuario mantenida`);
        console.log(`   ✅ Usuario sin grupo asignado (como debe ser)\n`);
        
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.$disconnect();
        process.exit(0);
    }
}

removeGroupAlieska();
