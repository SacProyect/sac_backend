import { z } from "zod";

export const updateUserByNamesSchema = z.object({
  name: z.string().min(1).trim().optional(),
  personId: z.coerce.number().int().positive().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
});

export type UpdateUserByNameDto = z.infer<typeof updateUserByNamesSchema>;

export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "La contraseña actual es requerida"),
    password: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Debes confirmar la nueva contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas nuevas no coinciden",
    path: ["confirmPassword"],
  });

export type UpdatePasswordDto = z.infer<typeof updatePasswordSchema>;
