/**
 * Servicio centralizado de envío de correos (Resend).
 * Desacopla la lógica de email de controladores y servicios de dominio.
 */

import { Resend } from "resend";
import logger from "../utils/logger";

const DEFAULT_FROM = "no-reply@sac-app.com";
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const resend = new Resend(RESEND_API_KEY);

export interface SendEmailParams {
    from?: string;
    to: string | string[];
    subject: string;
    html: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envía un correo con reintentos. Si RESEND_API_KEY no está configurada,
 * no lanza error y solo registra un warning.
 */
export async function sendWithRetry(
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

/** Instancia del servicio para inyección o uso directo. */
export const emailService = {
    sendWithRetry,
    getDefaultFrom: () => process.env.EMAIL_FROM ?? DEFAULT_FROM,
};
