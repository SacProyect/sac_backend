import { compareSync } from "bcrypt";
import { db } from "../utils/db.server";
import { generateAcessToken, NewUserInput, passwordHashing, User } from "./user.utils";

/**
 * Logs in a user.
 *
 * @param {number} personId - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<{ user: User | Error, token: string }>} A Promise resolving to an object containing the user or an error, and a token.
 */
export const logIn = async (personId: number, password: string): Promise<{ user: User | Error, token: string }> => {
    try {
        const user = await db.user.findUniqueOrThrow({
            include: {
                taxpayer: true,
            },
            where: {
                personId: personId,
                status: true
            }
        });
        
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        if (compareSync(password, user.password)) {
            const token = generateAcessToken(user);
            user.password = "";
            if (user.role == "ADMIN") {
                user.taxpayer = await db.taxpayer.findMany({ where: { status: true } })
            }

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
        if (input.password.length < 8) throw new Error('Contraseña debe ser mínimo de 8 caracteres')

        input.password = await passwordHashing(input.password);

        const newUser = await db.user.create({
            data: input
        });

        return newUser;
    } catch (error) {
        throw error;
    }
};
/**
 * Updates a user object.
 * 
 * @param userId The ID of the user to update.
 * @param data The updated data for the user.
 * @returns The updated user object or an error if the operation fails.
 */
export const updateuser = async (userId: string, data: Partial<NewUserInput>): Promise<User | Error> => {
    try {
        if (data.password) {
            data.password = await passwordHashing(data.password);
        }

        const updateduser = await db.user.update({
            where: {
                id: userId
            },
            data: {
                ...data
            }
        });


        return updateduser;
    } catch (error) {

        throw error;
    }
}

export const getAllUsers = async (): Promise<User[] | Error> => {
    try {
        const users = await db.user.findMany();
        return users
    } catch (error) {
        throw error;
    }
}

