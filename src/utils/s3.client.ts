import { S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION ?? "us-east-2";

let s3Instance: S3Client | null = null;

/**
 * Cliente S3 singleton. Reutilizar en todo el proyecto para evitar múltiples conexiones.
 */
export function getS3Client(): S3Client {
    if (!s3Instance) {
        s3Instance = new S3Client({ region });
    }
    return s3Instance;
}
