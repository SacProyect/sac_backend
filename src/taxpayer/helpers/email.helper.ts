/**
 * Helper de envío de correos con reintentos (Resend).
 * La instancia resend es privada al módulo.
 * Dependencias: ../../utils/logger y resend.
 */

import { Resend } from "resend";
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
