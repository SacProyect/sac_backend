import { compareSync } from "bcrypt";
import { db } from "../utils/db.server";
import { generateAcessToken, NewUserInput, passwordHashing, User } from "./user.utils";

/**
 * Logs in a user.
 *
 * @param {number} cedula - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<{ user: User | Error, token: string }>} A Promise resolving to an object containing the user or an error, and a token.
 */
export const logIn = async (cedula: number, password: string): Promise<{ user: User | Error, token: string }> => {
    try {
        const user = await db.usuario.findFirstOrThrow({
            include: {
                contribuyentes: true,
            },
            where: { cedula: cedula }
        });

        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        if (compareSync(password, user.contrasena)) {
            const token = generateAcessToken(user);

            return { user, token };
        } else {
            throw new Error('Contraseña erronea');
        }
    } catch (error) {
        throw error;
    }
};

/**
 * Creates a new user.
 *
 * @param {NewUserInput} input - The user data to create.
 * @returns {Promise<User | Error>} A Promise resolving to the created user or an error.
 */
export const signUp = async (input: NewUserInput): Promise<User | Error> => {
    try {
        if (input.contrasena.length < 8) throw new Error('Contraseña debe ser mínimo de 8 caracteres')

        input.contrasena = await passwordHashing(input.contrasena);

        const newUser = await db.usuario.create({
            data: input
        });

        return newUser;
    } catch (error) {
        throw error;
    }
};