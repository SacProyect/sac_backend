import { z } from "zod";

export const updateUserByNamesSchema = z.object({
  name: z.string().min(1).trim().optional(),
  personId: z.coerce.number().int().positive().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
});

export type UpdateUserByNameDto = z.infer<typeof updateUserByNamesSchema>;

export const updatePasswordSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export type UpdatePasswordDto = z.infer<typeof updatePasswordSchema>;
