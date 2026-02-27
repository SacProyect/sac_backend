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
    // Usamos register con useClass para el token del repositorio
    container.register(TAXPAYER_REPOSITORY_TOKEN, { useClass: TaxpayerRepository });

    // Servicios - usamos registerSingleton con la clase directamente
    // Esto permite que tsyringe resuelva las dependencias correctamente
    container.registerSingleton(TaxpayerService, TaxpayerService);
    container.registerSingleton(UserService, UserService);

    // Controladores (dependen de los servicios)
    container.registerSingleton(TaxpayerController, TaxpayerController);
    container.registerSingleton(UserController, UserController);
}

/**
 * Contenedor ya configurado. Llamar a configureContainer() una vez al arranque
 * (p. ej. en app.ts o index.ts) antes de resolver controladores.
 */
export { container };
