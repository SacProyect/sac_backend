import { z } from 'zod';
import * as dotenv from 'dotenv';
import path from 'path';

// Asegurar que las variables de entorno estén cargadas
dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url({ message: "DATABASE_URL debe ser una URL válida" }),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Auth
  TOKEN_SECRET: z.string().min(10, { message: "TOKEN_SECRET debe tener al menos 10 caracteres" }),
  
  // Email (Resend)
  EMAIL_FROM: z.string().email().optional(),
  RESEND_API_KEY: z.string().optional(),

  // Monitoring
  BETTERSTACK_SOURCE_TOKEN: z.string().optional(),
  BETTERSTACK_LOGS_ENDPOINT: z.string().url().optional(),

  // AWS
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SESSION_TOKEN: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),

  // Debug & Development
  DEBUG_AUTH: z.coerce.string().transform(v => v === 'true').default(false),
  DEBUG_LOGIN_HEADER: z.string().default('x-debug-login'),
  DRY_RUN: z.coerce.string().transform(v => v === 'true').default(false),

  // Test Credentials
  PERSON_ID: z.coerce.number().optional(),
  PASSWORD: z.string().optional(),

  // Feature Flags
  FF_NEW_ERROR_HIERARCHY: z.coerce.string().transform(v => v === 'true').default(false),
  FF_ZOD_ENV_VALIDATION: z.coerce.string().transform(v => v === 'true').default(false),
  FF_BIGINT_MIDDLEWARE: z.coerce.string().transform(v => v === 'true').default(false),
  FF_DI_CONTAINER: z.coerce.string().transform(v => v === 'true').default(false),
  FF_TAXPAYER_DTOS: z.coerce.string().transform(v => v === 'true').default(false),
  FF_NEW_TAXPAYER_SERVICE: z.coerce.string().transform(v => v === 'true').default(false),
  FF_NEW_REPORTS_SERVICE: z.coerce.string().transform(v => v === 'true').default(false),
  FF_NEW_TAXPAYER_REPOSITORY: z.coerce.string().transform(v => v === 'true').default(false),
  FF_STRATEGY_PATTERN: z.coerce.string().transform(v => v === 'true').default(false),
});

/**
 * Valida las variables de entorno al cargar el módulo.
 * Si FF_ZOD_ENV_VALIDATION está activo, lanzará un error si falla la validación.
 * De lo contrario, solo emitirá advertencias.
 */
const validateEnv = () => {
  try {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
      const tree = z.treeifyError(parsed.error);
      const errorMsg = Object.entries(tree.properties ?? {})
        .map(([field, details]) => `  - ${field}: ${details.errors.join(', ')}`)
        .join('\n');

      console.error('\x1b[31m%s\x1b[0m', '❌ Error de validación en variables de entorno:');
      console.error(errorMsg);

      // Si la validación con Zod es obligatoria (Feature Flag)
      if (process.env.FF_ZOD_ENV_VALIDATION === 'true') {
        console.error('\x1b[31m%s\x1b[0m', 'Debido a que FF_ZOD_ENV_VALIDATION=true, el proceso se cerrará.');
        process.exit(1);
      }
      
      return envSchema.parse({}); // Retorna defaults si no es fatal
    }

    return parsed.data;
  } catch (error) {
    console.error('Error inesperado validando entorno:', error);
    if (process.env.FF_ZOD_ENV_VALIDATION === 'true') {
      process.exit(1);
    }
    return envSchema.parse({ DATABASE_URL: 'dummy', TOKEN_SECRET: 'dummy' }); 
  }
};

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;
