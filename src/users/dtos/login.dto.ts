import { z } from "zod";

export const loginSchema = z.object({
  personId: z.coerce.number().int().positive("personId debe ser un número positivo"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export type LoginDto = z.infer<typeof loginSchema>;
