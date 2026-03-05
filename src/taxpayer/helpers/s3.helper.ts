/**
 * Helper de interacción con AWS S3 para URLs firmadas de descarga.
 * Cliente S3 y generación de URLs centralizados aquí (usa utils/s3-client).
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "../../utils/s3-client";
import logger from "../../utils/logger";

const s3 = getS3Client();
const BUCKET_NAME = process.env.S3_BUCKET ?? "sacbucketgeneral";
const DEFAULT_EXPIRES = 180;

/**
 * Genera una URL firmada para descarga (attachment).
 */
export async function generateSignedUrl(key: string, expiresIn: number = DEFAULT_EXPIRES): Promise<string> {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ResponseContentDisposition: "attachment",
        });
        return await getSignedUrl(s3, command, { expiresIn });
    } catch (error) {
        logger.error(`Error generating signed URL for key: ${key}`, error);
        throw new Error("No se pudo generar la URL de descarga.");
    }
}

export async function generateDownloadRepairUrl(key: string): Promise<string> {
    return generateSignedUrl(key, DEFAULT_EXPIRES);
}

export async function generateDownloadInvestigationPdfUrl(key: string): Promise<string> {
    return generateSignedUrl(key, DEFAULT_EXPIRES);
}
