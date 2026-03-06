/**
 * Helper de envío de correos con reintentos (Resend).
 * La instancia resend es privada al módulo.
 * Dependencias: ../../utils/logger y resend.
 */

import { Resend } from "resend";
import type { taxpayer as Taxpayer } from "@prisma/client";
import logger from "../../utils/logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const DEFAULT_FROM = "no-reply@sac-app.com";

const resend = new Resend(RESEND_API_KEY);

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SendEmailParams {
    from?: string;
    to: string | string[];
    subject: string;
    html: string;
}

/**
 * Envía un correo con reintentos. Si RESEND_API_KEY no está configurada,
 * no lanza error y solo registra un warning.
 */
export async function sendEmailWithRetry(
    params: SendEmailParams,
    retries = 3,
    delayMs = 3000
): Promise<void> {
    if (!RESEND_API_KEY) {
        logger.warn("RESEND_API_KEY no está configurada. Se omitió el envío de email.");
        return;
    }
    const from = params.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM;
    const to = Array.isArray(params.to) ? params.to : [params.to];
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await resend.emails.send({ from, to, subject: params.subject, html: params.html });
            return;
        } catch (err) {
            logger.error(`Intento ${attempt} de envío de email fallido:`, err);
            if (attempt < retries) {
                await sleep(delayMs);
            } else {
                logger.error("Todos los intentos de envío de email han fallado.");
            }
        }
    }
}

/** Funciones de templates HTML para correos del módulo taxpayer. */
export const htmlTemplates = {
    /** Envuelve un fragmento en un layout básico con estilos. */
    wrapBody(body: string): string {
        return `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
            ${body}
            <hr style="margin-top: 24px; border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #888;">Sistema SAC - Mensaje automático.</p>
        </div>`;
    },
};

/**
 * Template específico para el correo de "Nuevo Contribuyente AF creado".
 * Extraído desde TaxpayerCrudService para centralizar el HTML en este helper.
 */
export function buildNewTaxpayerEmailHtml(taxpayer: Taxpayer, fiscalName?: string | null): string {
    const now = new Date();
    const formattedDate = now.toLocaleDateString("es-VE", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    const body = `
        <h2 style="color: #2563eb;">📝 Nuevo Contribuyente Registrado</h2>
        <p>Se ha registrado un nuevo contribuyente en proceso <strong>AF</strong>.</p>
        <ul style="line-height: 1.6; font-size: 14px; padding-left: 20px; color: #374151;">
            <li><strong>Nombre:</strong> ${taxpayer.name}</li>
            <li><strong>RIF:</strong> ${taxpayer.rif}</li>
            <li><strong>Proceso:</strong> ${taxpayer.process}</li>
            <li><strong>Registrado por:</strong> ${fiscalName ?? "—"}</li>
            <li><strong>Fecha:</strong> ${formattedDate}</li>
        </ul>
    `;

    return htmlTemplates.wrapBody(body);
}
