import type { Taxpayer } from "../taxpayer-utils";

/** Resultado paginado de getAll. */
export interface TaxpayersPaginated {
    data: Taxpayer[];
    total: number;
    page: number;
    totalPages: number;
    limit: number;
}

/** Datos mínimos para crear un contribuyente (sin dependencias de Prisma en la interfaz). */
export interface CreateTaxpayerData {
    providenceNum: bigint;
    process: string;
    name: string;
    rif: string;
    contract_type: string;
    officerId: string;
    address: string;
    emition_date: string | Date;
    taxpayer_category_id: string;
    parish_id: string;
}

/** Datos actualizables de un contribuyente. */
export interface UpdateTaxpayerData {
    address?: string;
    providenceNum?: bigint;
    process?: string;
    name?: string;
    rif?: string;
    contract_type?: string;
    officerId?: string | null;
    parish_id?: string | null;
    taxpayer_category_id?: string | null;
    status?: boolean;
}

/** Token para inyectar ITaxpayerRepository en el contenedor (permite mocks en tests). */
export const TAXPAYER_REPOSITORY_TOKEN = Symbol.for("ITaxpayerRepository");

/**
 * Contrato del repositorio de contribuyentes.
 * La lógica de negocio debe depender de esta interfaz, no de la implementación concreta,
 * para permitir mocks en pruebas unitarias.
 */
export interface ITaxpayerRepository {
    /** Busca un contribuyente activo por RIF. */
    findByRif(rif: string): Promise<Taxpayer | null>;

    /** Lista contribuyentes con paginación y filtros opcionales. */
    getAll(
        page: number,
        limit: number,
        year?: number,
        search?: string
    ): Promise<TaxpayersPaginated>;

    /** Crea un contribuyente. */
    create(data: CreateTaxpayerData): Promise<Taxpayer>;

    /** Actualiza un contribuyente por ID. */
    update(id: string, data: Partial<UpdateTaxpayerData>): Promise<Taxpayer>;
}
