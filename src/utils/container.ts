import "reflect-metadata";
import { container } from "tsyringe";
import { UserService } from "../users/UserService";
import { UserController } from "../users/UserController";
import { TaxpayerService } from "../taxpayer/TaxpayerService";
import { TaxpayerController } from "../taxpayer/TaxpayerController";
import { TAXPAYER_REPOSITORY_TOKEN } from "../taxpayer/interfaces/ITaxpayerRepository";
import { TaxpayerRepository } from "../taxpayer/repository/taxpayer-repository";

/**
 * Configura el contenedor de inyección de dependencias (tsyringe).
 * Registra servicios y controladores como singletons para que una única
 * instancia sea compartida en toda la aplicación.
 */
export function configureContainer(): void {
    // Repositorios (contratos para facilitar mocks en tests)
    container.register(TAXPAYER_REPOSITORY_TOKEN, { useClass: TaxpayerRepository });

    // Servicios (lógica de negocio)
    container.registerSingleton(UserService);
    container.registerSingleton(TaxpayerService);

    // Controladores (dependen de los servicios)
    container.registerSingleton(UserController);
    container.registerSingleton(TaxpayerController);
}

/**
 * Contenedor ya configurado. Llamar a configureContainer() una vez al arranque
 * (p. ej. en app.ts o index.ts) antes de resolver controladores.
 */
export { container };
