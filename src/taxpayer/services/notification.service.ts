/**
 * NotificationService - Servicio para notificaciones por email
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { emailService } from '../../services/EmailService';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import logger from '../../utils/logger';

export class NotificationService {
    
    /**
     * Notifica a un contribuyente (marca como notificado y envía email)
     */
    static async notifyTaxpayer(taxpayerId: string): Promise<any> {
        try {
            // 1. Obtener datos del contribuyente
            const taxpayer = await db.taxpayer.findUnique({
                where: { id: taxpayerId },
                include: {
                    user: {
                        include: {
                            group: {
                                include: {
                                    coordinator: true
                                }
                            }
                        }
                    }
                }
            });

            if (!taxpayer) {
                throw new Error("Contribuyente no encontrado");
            }

            // 2. Marcar como notificado
            const notifiedTaxpayer = await runTransaction((tx) =>
                tx.taxpayer.update({
                    where: { id: taxpayerId },
                    data: { notified: true },
                })
            );

            // 3. Enviar email de notificación
            await this.sendNotificationEmail(taxpayer);

            invalidateTaxpayerCache();

            return notifiedTaxpayer;
        } catch (error: any) {
            logger.error("Error notifying taxpayer", { 
                taxpayerId,
                message: error?.message, 
                stack: error?.stack 
            });
            throw new Error("Error notifying the taxpayer");
        }
    }

    /**
     * Envía email de notificación al coordinador
     */
    private static async sendNotificationEmail(taxpayer: any): Promise<void> {
        try {
            const coordinatorEmail = taxpayer.user?.group?.coordinator?.email;
            const taxpayerName = taxpayer.name;
            const taxpayerProcess = taxpayer.process;
            const providenceNum = taxpayer.providenceNum?.toString() || '—';
            const address = taxpayer.address || '—';
            const fiscalName = taxpayer.user?.name || '—';

            const now = new Date();
            const formattedDate = now.toLocaleDateString('es-VE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            const formattedTime = now.toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit',
            });

            if (coordinatorEmail) {
                // No romper el endpoint si falla el envío del correo
                emailService.sendWithRetry({
                    to: coordinatorEmail,
                    subject: `Contribuyente notificado: ${taxpayerName}`,
                    html: this.buildNotificationEmailHtml(
                        taxpayerName,
                        taxpayerProcess,
                        providenceNum,
                        address,
                        fiscalName,
                        formattedDate,
                        formattedTime
                    ),
                }).catch((err: unknown) =>
                    logger.error("Error al enviar email de notificación:", err)
                );
            }
        } catch (error) {
            logger.error("Error sending notification email", error);
        }
    }

    /**
     * Construye el HTML del email de notificación
     */
    private static buildNotificationEmailHtml(
        taxpayerName: string,
        taxpayerProcess: string,
        providenceNum: string,
        address: string,
        fiscalName: string,
        formattedDate: string,
        formattedTime: string
    ): string {
        return `
        <div style="font-family: sans-serif; background-color: #f3f4f6; padding: 30px;">
            <div style="max-width: 600px; margin: auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
                <h2 style="color: #2563eb;">📬 Contribuyente Notificado</h2>
                <p>El contribuyente <strong>${taxpayerName}</strong> ha sido <span style="color: green; font-weight: bold;">notificado</span> por el fiscal <strong>${fiscalName}</strong>.</p>

                <ul style="line-height: 1.6; font-size: 14px; padding-left: 20px; color: #374151;">
                    <li><strong>Contribuyente:</strong> ${taxpayerName}</li>
                    <li><strong>Proceso:</strong> ${taxpayerProcess}</li>
                    <li><strong>Número de Providencia:</strong> ${providenceNum}</li>
                    <li><strong>Dirección:</strong> ${address}</li>
                    <li><strong>Notificado por:</strong> ${fiscalName}</li>
                    <li><strong>Fecha y hora:</strong> ${formattedDate} a las ${formattedTime}</li>
                </ul>

                <p>Puedes ver los detalles directamente en la plataforma:</p>

                <a href="https://www.sac-app.com/taxpayer/${taxpayerName}" target="_blank" style="display: inline-block; margin-top: 12px; padding: 10px 18px; background-color: #2563eb; color: white; border-radius: 8px; text-decoration: none;">Ver contribuyente</a>

                <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />

                <p style="font-size: 13px; color: #6b7280;">Este mensaje fue generado automáticamente por el sistema. No respondas a este correo.</p>
                <p style="font-size: 12px; color: #9ca3af;">© ${new Date().getFullYear()} Sistema de Administración de Contribuyentes</p>
            </div>
        </div>
        `;
    }

    /**
     * Envía email de confirmación de creación de contribuyente
     */
    static async sendTaxpayerCreatedNotification(
        taxpayer: any, 
        officerEmail?: string,
        coordinatorEmail?: string
    ): Promise<void> {
        try {
            const recipients: string[] = [];
            
            if (officerEmail) recipients.push(officerEmail);
            if (coordinatorEmail) recipients.push(coordinatorEmail);

            if (recipients.length === 0) return;

            const html = this.buildTaxpayerCreatedEmailHtml(taxpayer);

            await emailService.sendWithRetry({
                to: recipients,
                subject: `🔔 Nuevo Contribuyente AF: ${taxpayer.name}`,
                html,
            });
        } catch (error) {
            logger.error("Error sending taxpayer created notification", error);
        }
    }

    /**
     * Construye HTML para email de contribuyente creado
     */
    private static buildTaxpayerCreatedEmailHtml(taxpayer: any): string {
        const now = new Date();
        const formattedDate = now.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        return `
        <div style="font-family: sans-serif; background-color: #f3f4f6; padding: 30px;">
            <div style="max-width: 600px; margin: auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
                <h2 style="color: #2563eb;">📝 Nuevo Contribuyente Registrado</h2>
                <p>Se ha registrado un nuevo contribuyente en proceso <strong>AF</strong>.</p>
                <ul style="line-height: 1.6; font-size: 14px; padding-left: 20px; color: #374151;">
                    <li><strong>Nombre:</strong> ${taxpayer.name}</li>
                    <li><strong>RIF:</strong> ${taxpayer.rif}</li>
                    <li><strong>Proceso:</strong> ${taxpayer.process}</li>
                    <li><strong>Fecha:</strong> ${formattedDate}</li>
                </ul>
            </div>
        </div>
        `;
    }
}