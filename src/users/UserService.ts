import { injectable } from "tsyringe";
import * as userServiceImpl from "./user-services";
import type { NewUserInput, DataUserByNameInput } from "./user-utils";

/**
 * Servicio de usuarios expuesto para inyección de dependencias.
 * Delega en el módulo user-services existente.
 */
@injectable()
export class UserService {
    async logIn(personId: number, password: string) {
        return userServiceImpl.logIn(personId, password);
    }

    async signUp(input: NewUserInput) {
        return userServiceImpl.signUp(input);
    }

    async getAllUsers(user: { id: string; role: string }) {
        return userServiceImpl.getAllUsers(user);
    }

    async getUser(id: string) {
        return userServiceImpl.getUser(id);
    }

    async getFiscalsForReview(
        userId: string,
        userRole: string,
        year?: number,
        page: number = 1,
        limit: number = 50
    ) {
        return userServiceImpl.getFiscalsForReview(userId, userRole, year, page, limit);
    }

    async updateUserByName(name: string, data: DataUserByNameInput) {
        return userServiceImpl.updateUserByName(name, data);
    }

    async updatePassword(userId: string, currentPassword: string, newPassword: string) {
        return userServiceImpl.updatePassword(userId, currentPassword, newPassword);
    }

    async requestPasswordReset(email: string) {
        return userServiceImpl.requestPasswordReset(email);
    }

    async resetPasswordWithToken(token: string, newPassword: string) {
        return userServiceImpl.resetPasswordWithToken(token, newPassword);
    }
}
