import { compareSync } from "bcrypt";
import { db } from "../utils/db.server";
import { generateAcessToken, NewUserInput, passwordHashing, UpdateUserByNameInput, User } from "./user.utils";

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
                taxpayer: {
                    include: {
                        IVAReports: true,
                    }
                },
                coordinatedGroup: {
                    include: {
                        members: {
                            include: {
                                taxpayer: true,
                            }
                        },
                    }
                },
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
            user.taxpayer = await db.taxpayer.findMany({
                where: { status: true },
                include: {
                    user: {
                        select: {
                            name: true,
                            group: { select: { coordinatorId: true } },
                        },
                    },
                    IVAReports: true,
                }
            });

            return { user, token };
        } else {
            throw new Error('Las credenciales no son correctas.');
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

export const getAllUsers = async (user: { id: string, role: string }): Promise<User[] | Error> => {
    try {

        let users: User[] = [];

        if (user.role == "ADMIN") {
            users = await db.user.findMany();
        } else if (user.role == "COORDINATOR") {
            const coordinator = await db.user.findUnique({
                where: {
                    id: user.id
                },
                include: {
                    coordinatedGroup: {
                        include: {
                            members: true,
                        }
                    }
                }
            })
            if (coordinator?.coordinatedGroup?.members) {
                users = coordinator.coordinatedGroup.members;
            }
        }

        return users
    } catch (error) {
        throw error;
    }
}

export const getUser = async (id: string) => {


    try {
        const user = await db.user.findUnique({
            where: { id: id },
            include: {
                coordinatedGroup: true,
                taxpayer: {
                    include: {
                        IVAReports: true,
                    }
                },
            },
        });

        if (!user) {
            return null;
        }

        user.taxpayer = await db.taxpayer.findMany({
            where: { status: true },
            include: {
                IVAReports: true,
                user: {
                    select: {
                        name: true,
                        group: { select: { coordinatorId: true } }
                    },
                },
            }
        });

        // 3) remove password before sending back
        (user as any).password = "";

        // 4) issue a fresh token (you can tweak expiry here)
        const token = generateAcessToken(user);

        // 5) respond just like your login endpoint
        return { user, token };

    } catch (e) {
        console.error(e);
        throw new Error("Error getting the updated user with the new token.")
    }
}


export async function updateUserByName(name: string, data: UpdateUserByNameInput) {
    try {
        const normalizedName = normalizeText(name);

        const users = await db.user.findMany(); // todos los usuarios

        // Buscar manualmente el primer nombre que haga match "sin acentos" e insensible a mayúsculas
        const userFound = users.find(u =>
            normalizeText(u.name).toLowerCase() === normalizedName.toLowerCase()
        );

        if (!userFound) throw new Error("User not found");

        const updatedUser = await db.user.update({
            where: { personId: userFound.personId },
            data,
        });

        return updatedUser;
    } catch (e) {
        console.error(e);
        throw new Error("Couldn't update the user.");
    }
}

// Helper
function normalizeText(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

