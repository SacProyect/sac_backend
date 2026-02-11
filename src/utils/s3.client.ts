import { S3Client } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION ?? "us-east-2";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? "";
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? "";

if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
}
let s3Instance: S3Client | null = null;

/**
 * Cliente S3 singleton. Reutilizar en todo el proyecto para evitar múltiples conexiones.
 */
export function getS3Client(): S3Client {
    if (!s3Instance) {
        s3Instance = new S3Client({
            region,
            credentials: {
                accessKeyId: accessKeyId,
                secretAccessKey: secretAccessKey,
            }
        });
    }
    return s3Instance;
}
