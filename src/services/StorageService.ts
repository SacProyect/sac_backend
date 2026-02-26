/**
 * Servicio centralizado de almacenamiento (S3).
 * Subida de archivos, URLs firmadas y URLs públicas.
 * Desacopla la lógica de S3 de controladores y servicios de dominio.
 */

import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "../utils/s3-client";
import logger from "../utils/logger";

const BUCKET = process.env.S3_BUCKET ?? "sacbucketgeneral";
const REGION = process.env.AWS_REGION ?? "us-east-2";
const s3 = getS3Client();

export interface UploadInput {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
}

/**
 * Sube un archivo a S3.
 */
export async function upload(input: UploadInput): Promise<void> {
    await s3.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType,
        })
    );
}

/**
 * Genera una URL firmada para descarga (attachment).
 */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 180): Promise<string> {
    try {
        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ResponseContentDisposition: "attachment",
        });
        return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
    } catch (error) {
        logger.error("Error generating signed URL for key:", key, error);
        throw new Error("No se pudo generar la URL de descarga.");
    }
}

/**
 * URL pública del objeto en S3 (formato estándar).
 */
export function getPublicUrl(key: string): string {
    return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

/** Instancia del servicio para inyección o uso directo. */
export const storageService = {
    upload,
    getSignedDownloadUrl,
    getPublicUrl,
    bucket: BUCKET,
};
