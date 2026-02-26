import { z } from "zod";

const VALID_ROLES = ["FISCAL", "ADMIN", "COORDINATOR", "SUPERVISOR"] as const;

export const createUserSchema = z.object({
  personId: z.coerce.number().int().positive("personId debe ser un número positivo"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().min(1, "El nombre es requerido").trim(),
  role: z.enum(VALID_ROLES, {
    message: `role debe ser uno de: ${VALID_ROLES.join(", ")}`,
  }),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
