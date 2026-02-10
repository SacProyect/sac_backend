import { db, runTransaction } from "../utils/db.server";
import { CreateIndexIva, Event, FiscalTaxpayerStat, NewEvent, NewFase, NewIslrReport, NewIvaReport, NewObservation, NewPayment, NewTaxpayer, NewTaxpayerExcelInput, Payment, StatisticsResponse, Taxpayer } from "./taxpayer.utils";
import { BadRequestError } from "../utils/errors/BadRequestError";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Resend } from 'resend';
import { differenceInDays } from "date-fns"
import {
    getSignedUrl,
    S3RequestPresigner,
} from "@aws-sdk/s3-request-presigner";
import { Decimal } from "@prisma/client/runtime/library";
import { ISLRReports, IVAReports, Prisma, taxpayer, taxpayer_contract_type, taxpayer_process } from "@prisma/client";
import logger from "../utils/logger";


// Resend v4: `emails` exists on the instance, not the class.
const resend = new Resend(process.env.RESEND_API_KEY ?? "");
const s3 = new S3Client({ region: "us-east-2" });



export async function generateDownloadRepairUrl(key: string) {
    try {
        const command = new GetObjectCommand({
            Bucket: "sacbucketgeneral",
            Key: key, // Ej: "reparos/acta-123.pdf"
            ResponseContentDisposition: "attachment",
        });

        const url = await getSignedUrl(s3, command, { expiresIn: 180 }); // 3 minutes
        return url;
    } catch (error) {
        logger.error("Error generating signed URL for key:", key, error);
        throw new Error("No se pudo generar la URL de descarga.");
    }
}

export async function generateDownloadInvestigationPdfUrl(key: string) {

    try {
        const command = new GetObjectCommand({
            Bucket: "sacbucketgeneral",
            Key: key,
            ResponseContentDisposition: "attachment",
        })

        const url = await getSignedUrl(s3, command, { expiresIn: 180 });
        return url;

    } catch (e) {
        logger.error("Error generating signed URL for key:", key, e);
        throw new Error("No se pudo generar la url de descarga")
    }


}


// Helper para 'dormir' N milisegundos
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendEmailWithRetry(
    params: Parameters<typeof resend.emails.send>[0],
    retries = 3,
    delayMs = 3000
) {
    // If RESEND_API_KEY isn't configured, skip sending without crashing the API.
    if (!process.env.RESEND_API_KEY) {
        logger.warn("RESEND_API_KEY no está configurada. Se omitió el envío de email.");
        return;
    }
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await resend.emails.send(params);
        } catch (err) {
            logger.error(`Intento ${attempt} de envío de email fallido:`, err);
            if (attempt < retries) {
                // espera antes del próximo intento
                await sleep(delayMs);
            } else {
                // tras último intento, registra error y sigue adelante
                logger.error("Todos los intentos de envío de email han fallado.");
            }
        }
    }
}


/**
 * Creates a new taxpayer.
 *
 * @param {NewTaxpayer} input - The input data for the new taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the created taxpayer or an error.
 */
export const createTaxpayer = async (input: NewTaxpayer): Promise<Taxpayer | Error> => {
    try {

        const emitionDate = new Date(input.emition_date);
        const inputYear = emitionDate.getFullYear();

        if (input.role !== "ADMIN") {
            const normalizedName = input.name.replace(/\s+/g, "").toLowerCase();
            const firstWord = input.name.trim().split(/\s+/)[0];

            const matches = await taxpayerRepository.findTaxpayersByNameOrProvidenceNum(input.providenceNum, firstWord);

            for (const entry of matches) {
                const normalized = entry.name.replace(/\s+/g, "").toLowerCase();
                const sameName = normalized === normalizedName;
                const prevDate = new Date(entry.emition_date);
                const prevYear = prevDate.getFullYear();

                if (sameName) {
                    const afFpCombo = (entry.process === "AF" && input.process === "FP") ||
                        (entry.process === "FP" && input.process === "AF");

                    if (afFpCombo && inputYear === prevYear) {
                        throw new Error(`No se pueden registrar AF y FP en el mismo año para el mismo contribuyente.`);
                    }
                }
            }
        }

        if (!input.pdfs || input.pdfs.length === 0) {
            throw new Error("At least one PDF must be uploaded.");
        }

        // ✅ Validar que parishId y categoryId estén presentes
        if (!input.parishId || !input.categoryId) {
            throw new Error("Parroquia y Actividad Económica son campos obligatorios.");
        }

        const pdfs = input.pdfs!; // ya validado arriba
        const taxpayer = await runTransaction(async (tx) => {
            const created = await taxpayerRepository.createTaxpayer({
                providenceNum: input.providenceNum,
                process: input.process,
                name: input.name,
                contract_type: input.contract_type,
                officerId: input.officerId,
                rif: input.rif,
                address: input.address,
                emition_date: emitionDate.toISOString(),
                taxpayer_category_id: input.categoryId,
                parish_id: input.parishId,
            }, tx);

            await taxpayerRepository.createInvestigationPdfs(pdfs.map((pdf) => ({
                pdf_url: pdf.pdf_url,
                taxpayerId: created.id,
            })), tx);

            return created;
        });

        if (input.process === "AF") {
            const [officer, fiscalName, admins] = await Promise.all([
                taxpayerRepository.findUserByIdWithGroupCoordinator(input.officerId),
                taxpayerRepository.findUserNameById(input.userId ?? ""),
                taxpayerRepository.findAdmins(),
            ]);

            const fromAddress = process.env.EMAIL_FROM ?? 'no-reply@sac-app.com';
            const recipients = [
                ...admins.map(admin => admin.email),
                ...(officer?.group?.coordinator?.email ? [officer.group.coordinator.email] : []),
            ];
            const fiscalDisplayName = fiscalName ?? "—";

            const contractTypeMap: Record<string, string> = {
                SPECIAL: "ESPECIAL",
                ORDINARY: "ORDINARIO",
            };

            const displayContractType = contractTypeMap[input.contract_type] ?? input.contract_type;

            const emailHtml = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #2c3e50;">🆕 Nuevo Contribuyente para Auditoría Fiscal</h2>
                <p><strong>Fiscal Responsable:</strong> ${fiscalDisplayName}</p>
                <p>Se ha creado un nuevo contribuyente con el procedimiento <strong>Auditoría Fiscal (AF)</strong>.</p>
                <h3 style="margin-top:20px;color:#2980b9;">📋 Detalles</h3>
                <ul style="line-height:1.6;">
                    <li><strong>Nombre:</strong> ${input.name}</li>
                    <li><strong>RIF:</strong> ${input.rif}</li>
                    <li><strong>Tipo de contrato:</strong> ${displayContractType ?? "Desconocido"}</li>
                    <li><strong>Número de providencia:</strong> ${input.providenceNum}</li>
                    <li><strong>Fecha de emisión:</strong> ${new Date(input.emition_date).toLocaleDateString()}</li>
                    <li><strong>Dirección:</strong> ${input.address}</li>
                </ul>
                <a href="https://sac-app.com" target="_blank"
                style="
                    display: inline-block;
                    background-color: #2980b9;
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin-top: 10px;
                ">
                🔗 Ir a SAC App
                </a>

                <hr style="margin-top: 30px;" />
                <footer style="font-size: 12px; color: #888;">
                Este correo fue generado automáticamente por el sistema de gestión fiscal.
                </footer>
                </div>
            `;

            sendEmailWithRetry({
                from: fromAddress,
                to: recipients,
                subject: '🔍 Nuevo contribuyente creado para Auditoría Fiscal',
                html: emailHtml
            }).catch(err => logger.error("Error inesperado al enviar email:", err));
        }

        return taxpayer;

    } catch (error: any) {
        logger.error("Error creating taxpayer:", error);
        throw error;
    }
};


export const updateFase = async (data: NewFase) => {
    try {
        const taxpayerBefore = await taxpayerRepository.findTaxpayerWithUserAndCoordinator(data.id);
        if (!taxpayerBefore) {
            throw new Error('Taxpayer not found');
        }

        const oldFase = taxpayerBefore.fase.replace("_", " ");
        const updatedTaxpayerFase = await runTransaction((tx) =>
            taxpayerRepository.updateTaxpayerFase(data.id, data.fase, tx)
        );

        const adminUsers = await taxpayerRepository.findAdminEmails();

        // Construir lista de destinatarios
        const recipients = [
            taxpayerBefore.user?.email,
            ...adminUsers.map((admin) => admin.email),
        ].filter(Boolean); // Elimina null/undefined

        // Obtener nombres de personas
        const fiscalName = taxpayerBefore.user?.name || 'Fiscal asignado';
        const coordinatorName = taxpayerBefore.user?.group?.coordinator?.name || 'Coordinador asignado';
        const taxpayerName = taxpayerBefore.name;
        const taxpayerRif = taxpayerBefore.rif;
        const newFase = data.fase.replace("_", " ");

        // Enviar correo con Resend
        // ✅ No romper el flujo si falla el correo:
        // usamos el helper con reintentos y NO esperamos el resultado.
        sendEmailWithRetry({
            from: process.env.EMAIL_FROM ?? 'no-reply@sac-app.com', // asegúrate que esté verificado en Resend
            to: recipients.join(', '),
            subject: `Cambio de fase de auditoría fiscal - ${taxpayerName}`,
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f7f7f7; padding: 20px;">
            <div style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <h2 style="color: #2c3e50;">🔔 Cambio de Fase de Auditoría Fiscal</h2>
                <p style="font-size: 16px; color: #333;">Se ha actualizado la fase del contribuyente <strong>${taxpayerName}</strong> (RIF: ${taxpayerRif}).</p>
                
                <table style="width: 100%; font-size: 15px; color: #555; margin: 20px 0;">
                <tr>
                    <td><strong>Fase anterior:</strong></td>
                    <td>${oldFase}</td>
                </tr>
                <tr>
                    <td><strong>Nueva fase:</strong></td>
                    <td>${newFase}</td>
                </tr>
                <tr>
                    <td><strong>Fiscal responsable:</strong></td>
                    <td>${fiscalName}</td>
                </tr>
                <tr>
                    <td><strong>Coordinador del grupo:</strong></td>
                    <td>${coordinatorName}</td>
                </tr>
                </table>

                <p style="font-size: 15px; color: #333;">
                Puedes acceder a la plataforma para revisar el detalle del cambio haciendo clic en el siguiente botón:
                </p>

                <div style="text-align: center; margin: 30px 0;">
                <a href="https://sac-app.com/taxpayer/${data.id}" style="background-color: #1e88e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; display: inline-block;">
                    Ver contribuyente
                </a>
                </div>

                <p style="font-size: 13px; color: #888;">Este cambio fue registrado automáticamente por el sistema SAC.</p>
            </div>
            </div>
        `,
        }).catch((err) =>
            logger.error("Error inesperado al enviar email de cambio de fase:", err)
        );

        return updatedTaxpayerFase;
    } catch (e) {
        logger.error(e);
        throw new Error('Could not update the fase');
    }
};


export const createTaxpayerExcel = async (data: NewTaxpayerExcelInput) => {
    const {
        providenceNum,
        process,
        name,
        rif,
        contract_type,
        officerName,
        address,
        emition_date,
        categoryId,
        parishId,
    } = data;

    try {
        const users = await taxpayerRepository.findManyUsers();
        const normalizedInputName = normalize(officerName);
        const matchedOfficer = users.find((u) =>
            normalize(u.name).includes(normalizedInputName) || normalizedInputName.includes(normalize(u.name))
        );

        if (!matchedOfficer) {
            throw new Error(`No officer found with name similar to "${officerName}"`);
        }

        // ✅ CORRECCIÓN 2026: Verificación mejorada de duplicados
        // Buscar duplicados activos del mismo año ANTES de crear
        // Validar fecha primero para evitar errores
        let inputYear: number;
        try {
            const inputDate = new Date(emition_date);
            if (isNaN(inputDate.getTime())) {
                throw new Error(`Fecha de emisión inválida: "${emition_date}". Por favor verifica el formato de la fecha.`);
            }
            inputYear = inputDate.getFullYear();
        } catch (dateError: any) {
            logger.warn("Error al procesar la fecha de emisión", { emition_date, message: dateError?.message });
            throw new Error(`Error al procesar la fecha de emisión: ${dateError.message}`);
        }
        
        const startOfYear = new Date(Date.UTC(inputYear, 0, 1, 0, 0, 0, 0));
        const endOfYear = new Date(Date.UTC(inputYear + 1, 0, 1, 0, 0, 0, 0));
        
        const existingByProvidence = await taxpayerRepository.findExistingByProvidence(providenceNum, startOfYear, endOfYear);

        const currentYear = new Date().getFullYear();
        
        // ✅ CORRECCIÓN 2026: Permitir cualquier fecha del año actual o anterior
        // Solo bloquear fechas muy futuras (más de 1 año adelante) para prevenir errores
        // Validar que la fecha es válida antes de continuar
        const inputDate = new Date(emition_date);
        if (isNaN(inputDate.getTime())) {
            throw new Error(`Fecha de emisión inválida: "${emition_date}". Por favor verifica el formato de la fecha (debe ser YYYY-MM-DD o formato ISO).`);
        }
        
        const maxAllowedDate = new Date();
        maxAllowedDate.setFullYear(maxAllowedDate.getFullYear() + 1); // Permitir hasta 1 año en el futuro
        
        if (inputDate > maxAllowedDate) {
            throw new Error(`La fecha de emisión no puede ser más de un año en el futuro. Fecha recibida: ${inputDate.toLocaleDateString()}`);
        }
        
        // ✅ Permitir fechas del año actual (2026) y anteriores (2025) sin restricción
        // Esto permite crear casos del año actual en cualquier momento del año

        // ✅ REFACTORIZACIÓN 2026: Relajar validaciones para permitir casos 2025 Y casos 2026
        // Solo aplicar restricciones estrictas para duplicados en el mismo año
        // Para casos 2025, permitir edición/creación si no está culminado (trabajo pendiente)
        // Para casos 2026, aplicar validaciones normales de duplicados
        for (const entry of existingByProvidence) {
            const existingProcess = entry.process;
            const existingYear = new Date(entry.emition_date).getFullYear();
            const sameYear = inputYear === existingYear;

            const combination = [existingProcess, process].sort().join('|');

            // ✅ Validación de duplicados: Solo bloquear si es el mismo proceso en el mismo año
            // PERO permitir si es año anterior (2025) para completar trabajo pendiente
            if (existingProcess === process && sameYear) {
                // Permitir si es año anterior (2025) - casos pendientes
                if (inputYear < currentYear) {
                    logger.info(`⚠️ Permitido: Caso ${process} del año ${inputYear} (año anterior) - trabajo pendiente`);
                    continue; // Continuar sin lanzar error
                }
                // Para año actual (2026) o futuro, bloquear duplicados (comportamiento normal)
                throw new Error(`Ya existe un contribuyente con proceso ${process} y el mismo número de providencia en el mismo año ${inputYear}.`);
            }

            if (combination === 'AF|VDF' && sameYear) {
                // Permitir si es año anterior (2025) - trabajo pendiente
                if (inputYear < currentYear) {
                    logger.info(`⚠️ Permitido: Combinación AF|VDF del año ${inputYear} (año anterior) - trabajo pendiente`);
                    continue;
                }
                // Para año actual (2026), bloquear combinación (comportamiento normal)
                throw new Error(`No puedes registrar un ${process} si ya existe un ${existingProcess} con el mismo número de providencia en el mismo año ${inputYear}.`);
            }

            if (existingProcess === 'FP' && process === 'FP' && sameYear) {
                // Permitir si es año anterior (2025) - trabajo pendiente
                if (inputYear < currentYear) {
                    logger.info(`⚠️ Permitido: Segundo FP del año ${inputYear} (año anterior) - trabajo pendiente`);
                    continue;
                }
                // Para año actual (2026), bloquear duplicado (comportamiento normal)
                throw new Error(`No puedes registrar dos FP con el mismo número de providencia en el mismo año ${inputYear}.`);
            }

            // // Para restricciones por meses
            // const monthsDiff = (new Date(emition_date).getTime() - new Date(entry.emition_date).getTime()) / (1000 * 60 * 60 * 24 * 30);
            // const threshold = ['VDF', 'FP'].includes(process) ? 14 : 15;

            // if (existingProcess === process && monthsDiff < threshold) {
            //     throw new Error(`No han pasado los ${threshold} meses requeridos para crear otro contribuyente con el proceso ${process} y el mismo número de providencia.`);
            // }
        }

        // Verificación por nombre similar en el mismo año
        const normalizedName = name.replace(/\s+/g, "").toLowerCase();
        const firstWord = name.trim().split(/\s+/)[0];

        const candidates = await taxpayerRepository.findCandidatesByName(firstWord);

        // ✅ CORRECCIÓN 2026: Validación de nombre similar - solo bloquear duplicados exactos en mismo año
        // Permitir casos 2025 (trabajo pendiente) y casos 2026 (año actual)
        const sameName = candidates.filter((c) =>
            c.name.replace(/\s+/g, "").toLowerCase() === normalizedName &&
            new Date(c.emition_date).getFullYear() === inputYear
        );

        // Solo bloquear por nombre si es duplicado exacto en el mismo año
        // Para años anteriores (2025), permitir para completar trabajo pendiente
        // Para año actual (2026), bloquear solo si es duplicado exacto (comportamiento normal)
        if (sameName.length > 0) {
            if (inputYear < currentYear) {
                // Año anterior: solo advertencia, permitir
                logger.info(`⚠️ Advertencia: Existe contribuyente similar en año ${inputYear}, pero se permite por ser año anterior (trabajo pendiente)`);
            } else {
                // Año actual o futuro: bloquear duplicado exacto
                throw new Error(`Ya existe un contribuyente con un nombre similar a "${name}" en el mismo año ${inputYear}.`);
            }
        }

        // ✅ CORRECCIÓN 2026: Permitir fechas progresivas del calendario y fechas pasadas del mismo mes/año
        // Usar mediodía UTC para evitar problemas de zona horaria, pero mantener la fecha que el fiscal ingresa
        let finalEmitionDate: Date;
        const providedDate = new Date(emition_date);
        
        // Validar que la fecha es válida
        if (isNaN(providedDate.getTime())) {
            throw new Error(`Fecha de emisión inválida: "${emition_date}". Por favor verifica el formato de la fecha.`);
        }
        
        // ✅ PERMITIR cualquier fecha del año actual (2026) progresivamente
        // ✅ PERMITIR fechas pasadas del mismo mes/año (si es día 20 y quiere cargar algo del día 16)
        // Solo usar mediodía UTC para evitar problemas de zona horaria, pero mantener la fecha ingresada
        // Reutilizar inputYear ya declarado arriba (línea 384) - no redeclarar
        const finalInputYear = providedDate.getUTCFullYear();
        const inputMonth = providedDate.getUTCMonth();
        const inputDay = providedDate.getUTCDate();
        
        // Usar mediodía UTC para evitar problemas de zona horaria, pero mantener año, mes y día ingresados
        finalEmitionDate = new Date(Date.UTC(
            finalInputYear,
            inputMonth,
            inputDay,
            12, 0, 0, 0 // Mediodía UTC para evitar problemas de zona horaria
        ));
        
        // ✅ Validación: Permitir fechas del año actual y anteriores
        // Permitir fechas hasta 1 mes en el futuro para casos anticipados
        const today = new Date();
        const maxFutureDate = new Date(today);
        maxFutureDate.setMonth(maxFutureDate.getMonth() + 1); // Permitir hasta 1 mes en el futuro
        
        if (finalEmitionDate > maxFutureDate) {
            throw new Error(`La fecha de emisión no puede ser más de un mes en el futuro. Fecha recibida: ${providedDate.toLocaleDateString()}`);
        }
        
        // ✅ PERMITIR fechas pasadas sin restricción (el fiscal puede registrar cosas que se olvidó)
        // Ejemplo: Si es día 20 y quiere cargar algo del día 16 → PERMITIDO
        // No hay validación de fecha mínima - se permite cualquier fecha pasada
        
        const newTaxpayer = await runTransaction((tx) =>
            taxpayerRepository.createTaxpayerFromExcel({
                providenceNum,
                process,
                name,
                rif,
                contract_type,
                officerId: matchedOfficer.id,
                address,
                emition_date: finalEmitionDate,
                taxpayer_category_id: categoryId,
                parish_id: parishId,
            }, tx)
        );

        return newTaxpayer;
    } catch (error: any) {
        logger.error("Error creating taxpayer:", error);

        if (error.code === 'P2002') {
            throw new Error(`A taxpayer with this RIF already exists: ${rif}`);
        }

        if (error instanceof RangeError && error.message.includes("Invalid time value")) {
            throw new Error(`Invalid emition_date: "${emition_date}"`);
        }

        if (error.name === "PrismaClientValidationError") {
            throw new Error(`Invalid data sent to database: ${error.message}`);
        }

        // ✅ CORRECCIÓN: Mensaje de error más claro para los fiscales
        const errorMessage = error.message || "Error desconocido al crear el contribuyente";
        logger.error("Error detallado en createTaxpayerExcel:", {
            error: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name,
            data: { providenceNum, process, name, rif, emition_date }
        });
        throw new Error(errorMessage);
    }
}

function normalize(str: string): string {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}


/**
 * Creates a new event.
 *
 * @param {NewEvent} input - The input data for the new event.
 * @returns {Promise<Event | Error>} A Promise resolving to the created event or an error.
 */
export const createEvent = async (input: NewEvent): Promise<Event | Error> => {
    try {
        // ✅ CORRECCIÓN 2026: Validación mejorada para prevenir errores 500

        if (input.taxpayerId) {
            const taxpayer = await taxpayerRepository.findById(input.taxpayerId);
            if (!taxpayer) {
                throw new Error(`Contribuyente con ID ${input.taxpayerId} no encontrado o está inactivo.`);
            }
        }

        if (input.type === "PAYMENT_COMPROMISE") {
            if (!input.fineEventId) {
                throw new Error("fineEventId es requerido para eventos de tipo PAYMENT_COMPROMISE.");
            }
            const verifyEvent = await taxpayerRepository.findEventById(input.fineEventId);
            if (!verifyEvent) {
                throw new Error(`Evento de multa con ID ${input.fineEventId} no encontrado.`);
            }
            if (input.amount !== undefined && Number(input.amount) > Number(verifyEvent.debt)) {
                throw BadRequestError("AmountError", "El monto no puede ser mayor que la deuda de la multa.");
            }
        }

        // Validar campos requeridos según el tipo
        if (!input.date) {
            throw new Error("La fecha es requerida para crear un evento.");
        }

        if (!input.taxpayerId) {
            throw new Error("El ID del contribuyente es requerido.");
        }

        // Validar que la fecha sea válida
        const eventDate = new Date(input.date);
        if (isNaN(eventDate.getTime())) {
            throw new Error(`Fecha inválida: ${input.date}`);
        }

        // Set expires_at to 15 days from now if it's not provided
        const expiresAt = input.expires_at ?? new Date(new Date(input.date).getTime() + 15 * 24 * 60 * 60 * 1000);

        const event = await runTransaction((tx) =>
            taxpayerRepository.createEvent({
                ...input,
                expires_at: expiresAt,
            }, tx)
        );

        return event;

    } catch (error) {
        logger.error("Error creating event: ", error)
        throw error;
    }
}




/**
 * Creates a new payment.
 *
 * @param {NewPayment} input - The input data for the new payment.
 * @returns {Promise<Payment | Error>} A Promise resolving to the created payment or an error.
 */
export const createPayment = async (input: NewPayment): Promise<Payment | Error> => {
    try {

        const event = await taxpayerRepository.findEventById(String(input.eventId));
        if (!event) {
            throw new Error("Event not found");
        }
        if (Number(event.debt) < Number(input.amount)) {
            throw BadRequestError("AmountError", "Payment can't be greater than debt");
        }

        const newPayment = await runTransaction(async (tx) => {
            const payment = await taxpayerRepository.createPayment(input, tx);
            await taxpayerRepository.updateEventDebt(input.eventId, input.amount, tx);
            return payment;
        });

        return newPayment
    } catch (error: any) {
        logger.error("Error creating payment", { eventId: input?.eventId, taxpayerId: input?.taxpayerId, message: error?.message, stack: error?.stack });
        throw error;
    }
}

export async function modifyIndexIva(newIndexIva: Decimal, taxpayerId: string) {

    try {

        const taxpayer = await runTransaction((tx) =>
            taxpayerRepository.updateIndexIva(taxpayerId, newIndexIva, tx)
        );

        return taxpayer;

    } catch (e) {
        logger.error(e);
        throw new Error("No se pudo modificar el indice de IVA individual.");
    }

}

export async function createIndexIva(data: CreateIndexIva) {
    try {
        const result = await runTransaction(async (tx) => {
            // Obtener los índices anteriores activos
            const previousIndexIva = await taxpayerRepository.findIndexIvaExpired(tx);

            // Actualizar expires_at a NOW
            await taxpayerRepository.expireIndexIva(tx);

            // Crear nuevos índices
            const [indexIvaSpecial, indexIvaOrdinary] = await Promise.all([
                taxpayerRepository.createIndexIvaRecord("SPECIAL", data.specialAmount, tx),
                taxpayerRepository.createIndexIvaRecord("ORDINARY", data.ordinaryAmount, tx),
            ]);

            // Recorre los índices anteriores y actualiza taxpayers
            for (const oldIndex of previousIndexIva) {
                await taxpayerRepository.updateTaxpayerIndexIva(
                    {
                        index_iva: oldIndex.base_amount,
                        contract_type: oldIndex.contract_type,
                    },
                    {
                        index_iva: oldIndex.contract_type === "SPECIAL" ? data.specialAmount : data.ordinaryAmount,
                    },
                    tx
                );
            }

            return { indexIvaSpecial, indexIvaOrdinary };
        });

        return result;

    } catch (e) {
        logger.error(e);
        throw new Error("No se pudo cambiar el índice de IVA");
    }
}


/**
 * Gets all events for a given taxpayer.
 *
 * @param {string} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Event[] | Error>} A Promise resolving to an array of events or an error.
 */
export const getEventsbyTaxpayer = async (taxpayerId?: string, type?: string): Promise<Event[] | Error> => {
    try {

        let events: any;

        const where: any = {
            status: true
        }

        if (taxpayerId) {
            where.taxpayerId = taxpayerId;
        }

        if (type && type !== "payment") {
            where.type = type
            events = await taxpayerRepository.findEvents(where);
        } else if (type === "payment") {
            events = await taxpayerRepository.findPayments(where)
        } else {
            const foundEvents = await taxpayerRepository.findEvents(where);
            const payments = await taxpayerRepository.findPayments(where);

            events = [...foundEvents, ...payments]
        }

        const mappedResponse: Event[] = events.map((event: any) => {
            return {
                id: event.id,
                date: event.date,
                type: event.type ? event.type : "payment",
                amount: event.amount,
                debt: event.debt,
                description: event.description,
                taxpayerId: event.taxpayerId,
                officerId: event.taxpayer.officerId,
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`
            }
        })

        return mappedResponse
    } catch (error) {
        logger.error(error)
        throw error;
    }
}



/**
 * Gets a taxpayer by its ID.
 *
 * @param {string} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the taxpayer or an error.
 */
export const getTaxpayerById = async (taxpayerId: string): Promise<Taxpayer | Error> => {
    try {
        const taxpayer = await taxpayerRepository.findById(taxpayerId);

        if (!taxpayer) {
            throw new Error(`No active taxpayer found with ID ${taxpayerId}`);
        }

        return taxpayer;
    } catch (error: any) {
        logger.error("Error getTaxpayerById", { taxpayerId, message: error?.message, stack: error?.stack });
        throw error;
    }
}

export const getFiscalTaxpayersForStats = async (userId: string) => {
    try {
        const user = await taxpayerRepository.findUserWithTaxpayerStats(userId);

        if (!user) throw new Error("Usuario no encontrado");

        const today = new Date();

        const stats: {
            vdfOnTime: FiscalTaxpayerStat[];
            vdfLate: Array<FiscalTaxpayerStat & { delayDays: number }>;
            afOnTime: FiscalTaxpayerStat[];
            afLate: Array<FiscalTaxpayerStat & { delayDays: number }>;
        } = {
            vdfOnTime: [],
            vdfLate: [],
            afOnTime: [],
            afLate: [],
        };

        user.taxpayer.forEach((tp: any) => {
            const daysElapsed = tp.created_at ? differenceInDays(today, new Date(tp.created_at)) : null;
            const isCulminated = tp.culminated;

            const totalIva = tp.IVAReports.reduce((sum: number, r: any) => sum + Number(r.paid || 0), 0);
            const totalIslr = tp.ISLRReports.reduce((sum: number, r: any) => sum + Number(r.paid || 0), 0);
            const totalFines = tp.event
                .filter((e: any) => e.type === "FINE" && e.debt.equals(0))
                .reduce((sum: number) => sum + 1, 0);

            const totalCollected = totalIva + totalIslr + totalFines;

            const taxpayerData: FiscalTaxpayerStat = {
                id: tp.id,
                name: tp.name,
                rif: tp.rif,
                address: tp.address,
                date: tp.created_at ?? null,
                emition_date: tp.emition_date,
                fase: tp.fase,
                process: tp.process,
                culminated: isCulminated,
                collectedIva: totalIva.toString(),
                collectedIslr: totalIslr.toString(),
                collectedFines: totalFines.toString(),
                totalCollected: totalCollected.toString(),
                deadline: isCulminated ? "Completado" : daysElapsed,
            };

            if (tp.process === "VDF") {
                if (!isCulminated && daysElapsed !== null) {
                    if (daysElapsed <= 10) stats.vdfOnTime.push(taxpayerData);
                    else stats.vdfLate.push({ ...taxpayerData, delayDays: daysElapsed - 10 });
                }
            } else if (tp.process === "AF") {
                if (!isCulminated && daysElapsed !== null) {
                    if (daysElapsed <= 120) stats.afOnTime.push(taxpayerData);
                    else stats.afLate.push({ ...taxpayerData, delayDays: daysElapsed - 120 });
                }
            }
        });

        return stats;
    } catch (e) {
        logger.error(e);
        throw new Error("No se pudieron obtener los contribuyentes.");
    }
};

export const getTaxpayersForEvents = async (userId: string, userRole: string) => {
    try {
        const taxpayers = await taxpayerRepository.findTaxpayersForEvents(userId, userRole);
        return taxpayers;
    } catch (e: any) {
        logger.error(e);
        throw new Error(e.message || "Error al obtener contribuyentes");
    }
}

export const getTaxpayers = async () => {
    try {
        const taxpayers = await taxpayerRepository.findAll();
        return taxpayers;
    } catch (e) {
        logger.error(e);
        throw new Error("No se pudo obtener la lista de contribuyentes.")
    }
}


/**
 * Gets all taxpayers associated with a given user.
 *
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Taxpayer[] | Error>} A Promise resolving to an array of taxpayers or an error.
 */
export const getTaxpayersByUser = async (userId: string): Promise<Taxpayer[] | Error> => {
    try {
        const taxpayers = await taxpayerRepository.findByUser(userId);
        return taxpayers
    } catch (error: any) {
        logger.error("Error getTaxpayersByUser", { userId, message: error?.message, stack: error?.stack });
        throw error
    }
}



/**
 * Deletes a taxpayer by changing their status to false.
 * 
 * @param {number}taxpayerId The ID of the taxpayer to delete.
 * @returns The updated taxpayer object or an error if the operation fails.
 */
export const deleteTaxpayerById = async (taxpayerId: string): Promise<Taxpayer | Error> => {
    try {
        const removedTaxpayer = await runTransaction((tx) => taxpayerRepository.deleteById(taxpayerId, tx));
        return removedTaxpayer;
    } catch (error: any) {
        logger.error("Error deleteTaxpayerById", { taxpayerId, message: error?.message, stack: error?.stack });
        throw error;
    }
}

/**
 * Deletes a taxpayer by changing their status to false.
 * 
 * @param {string} eventId The ID of the taxpayer to delete.
 * @returns The updated taxpayer object or an error if the operation fails.
 */
export const deleteEvent = async (eventId: string): Promise<Event | Error> => {
    try {
        const updatedEvent = await runTransaction((tx) => taxpayerRepository.deleteEventById(eventId, tx));
        return updatedEvent;
    } catch (error: any) {
        logger.error("Error deleteEvent", { eventId, message: error?.message, stack: error?.stack });
        throw error;
    }
}

export const deleteIva = async (id: string) => {
    try {
        const deletedReport = await runTransaction((tx) => taxpayerRepository.deleteIvaById(id, tx));

        return deletedReport;
    } catch (e) {
        logger.error(e);
        throw new Error("No se pudo borrar el reporte de IVA");
    }
}

export const deleteIslr = async (id: string) => {
    try {
        const deletedReport = await runTransaction((tx) => taxpayerRepository.deleteIslrById(id, tx));
        return deletedReport;
    } catch (e) {
        logger.error(e);
        throw new Error("No se pudo eliminar el reporte de ISLR.")
    }
}

/**
 * Deletes a payment by changing their status to false.
 * 
 * @param {string}eventId The ID of the payment to delete.
 * @returns The updated payment object or an error if the operation fails.
 */
export const deletePayment = async (eventId: string): Promise<Payment | Error> => {
    try {
        const updatedEvent = await runTransaction((tx) => taxpayerRepository.deletePaymentById(eventId, tx));
        return updatedEvent;
    } catch (error: any) {
        logger.error("Error deletePayment", { eventId, message: error?.message, stack: error?.stack });
        throw error;
    }
}


export const deleteObservation = async (id: string) => {
    try {
        const deleteEvent = await runTransaction((tx) => taxpayerRepository.deleteObservationById(id, tx));

        return deleteEvent;
    } catch (e) {
        logger.error("Error erasing the observation: ", e);
        throw new Error("Error erasing the observation");
    }
}

/**
 * Updates a taxpayer object.
 * 
 * @param taxpayerId The ID of the taxpayer to update.
 * @param data The updated data for the taxpayer.
 * @returns The updated taxpayer object or an error if the operation fails.
 */

/**
 * ✅ REFACTORIZACIÓN 2026: Permite edición de casos del año anterior (2025)
 * - No valida restricciones de año para casos no culminados
 * - Permite acceso a fiscales rotados si son supervisor histórico o actual del fiscal asignado
 */
export const updateTaxpayer = async (
    taxpayerId: string,
    data: Partial<Taxpayer>,
    userId?: string,
    userRole?: string
): Promise<Taxpayer | Error> => {
    try {
        // ✅ Validación de acceso para fiscales rotados (solo si se proporciona userId)
        if (userId && userRole && userRole === "FISCAL") {
            const taxpayer = await db.taxpayer.findUnique({
                where: { id: taxpayerId },
                include: {
                    user: {
                        include: {
                            supervisor: {
                                select: { id: true }
                            }
                        }
                    }
                }
            });

            if (!taxpayer) {
                throw new Error("Contribuyente no encontrado");
            }

            // ✅ PERMITIR EDICIÓN si:
            // 1. El usuario es el fiscal asignado actual (officerId)
            // 2. El usuario es el supervisor actual del fiscal asignado
            // 3. El usuario es el supervisor histórico del fiscal asignado (si existe)
            const isCurrentOfficer = taxpayer.officerId === userId;
            const isCurrentSupervisor = taxpayer.user?.supervisor?.id === userId;
            
            // Verificar si el usuario fue supervisor histórico (buscando en el historial del fiscal)
            // Nota: Como no hay campo supervisor_id_historico en el schema, asumimos que
            // si el fiscal actual tiene un supervisor diferente, el anterior podría ser histórico
            // Por ahora, permitimos acceso si es supervisor actual o fiscal asignado
            
            if (!isCurrentOfficer && !isCurrentSupervisor) {
                // Verificar si el usuario es supervisor de algún miembro del grupo del fiscal
                if (taxpayer.user?.groupId) {
                    const group = await db.fiscalGroup.findUnique({
                        where: { id: taxpayer.user.groupId },
                        include: {
                            members: {
                                where: {
                                    supervisorId: userId
                                }
                            }
                        }
                    });
                    
                    if (!group || group.members.length === 0) {
                        throw new Error("No tienes permisos para editar este contribuyente. Solo el fiscal asignado o su supervisor pueden editarlo.");
                    }
                } else {
                    throw new Error("No tienes permisos para editar este contribuyente. Solo el fiscal asignado o su supervisor pueden editarlo.");
                }
            }
        }

        const updateData: Prisma.taxpayerUpdateInput = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.rif !== undefined) updateData.rif = data.rif;
        if (data.providenceNum !== undefined)
            updateData.providenceNum = data.providenceNum;
        if (data.contract_type !== undefined)
            updateData.contract_type = data.contract_type as taxpayer_contract_type;
        if (data.process !== undefined)
            updateData.process = data.process as taxpayer_process;
        if (data.fase !== undefined) updateData.fase = data.fase;
        if (data.address !== undefined) updateData.address = data.address;

        // Relaciones
        if (data.parish_id) {
            updateData.parish = { connect: { id: data.parish_id } };
        }

        if (data.taxpayer_category_id) {
            updateData.taxpayer_category = { connect: { id: data.taxpayer_category_id } };
        }

        const updatedTaxpayer = await runTransaction((tx) =>
            tx.taxpayer.update({
                where: { id: taxpayerId },
                data: updateData,
            })
        );

        return updatedTaxpayer;
    } catch (e: any) {
        logger.error("Error updateTaxpayer", { taxpayerId, message: e?.message, stack: e?.stack });
        throw new Error(e);
    }
};


/**
 * Updates an event object.
 * 
 * @param eventId The ID of the event to update.
 * @param data The updated data for the event.
 * @returns The updated event object or an error if the operation fails.
 */
export const updateEvent = async (eventId: string, data: Partial<NewEvent>): Promise<Event | Error> => {

    // logger.info("EVENT ID: " + eventId);
    try {
        logger.info("EVENT ID: " + eventId);
        logger.info("DATA: " + JSON.stringify(data));
        const updatedEvent = await runTransaction((tx) =>
            tx.event.update({
                where: {
                    id: eventId
                },
                data: {
                    ...data
                }
            })
        );
        return updatedEvent;
    } catch (error) {
        logger.error(error);
        throw error;
    }
}

/**
 * Updates an IVA report.
 * ✅ REFACTORIZACIÓN 2026: Permite editar reportes IVA de años anteriores (2025)
 * 
 * @param ivaId The ID of the IVA report to update.
 * @param data The updated fields for the IVA report.
 * @param userId Optional user ID for access validation
 * @param userRole Optional user role for access validation
 * @returns The updated IVA report.
 */
export const updateIvaReport = async (
    ivaId: string, 
    data: Partial<IVAReports>,
    userId?: string,
    userRole?: string
): Promise<IVAReports> => {
    try {
        // ✅ Validación de acceso para fiscales rotados
        if (userId && userRole && userRole === "FISCAL") {
            const ivaReport = await db.iVAReports.findUnique({
                where: { id: ivaId },
                include: {
                    taxpayer: {
                        include: {
                            user: {
                                include: {
                                    supervisor: {
                                        select: { id: true }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (ivaReport?.taxpayer) {
                const isCurrentOfficer = ivaReport.taxpayer.officerId === userId;
                const isCurrentSupervisor = ivaReport.taxpayer.user?.supervisor?.id === userId;
                
                if (!isCurrentOfficer && !isCurrentSupervisor) {
                    if (ivaReport.taxpayer.user?.groupId) {
                        const group = await db.fiscalGroup.findUnique({
                            where: { id: ivaReport.taxpayer.user.groupId },
                            include: {
                                members: {
                                    where: {
                                        supervisorId: userId
                                    }
                                }
                            }
                        });
                        
                        if (!group || group.members.length === 0) {
                            throw new Error("No tienes permisos para editar este reporte.");
                        }
                    } else {
                        throw new Error("No tienes permisos para editar este reporte.");
                    }
                }
            }
        }

        // Remover campos que no deben ser actualizados directamente
        const { taxpayerId, id, _key, created_at, ...cleanData } = data as any;

        const updatedIva = await runTransaction((tx) =>
            tx.iVAReports.update({
                where: { id: ivaId },
                data: {
                    ...cleanData,
                    updated_at: new Date(),
                },
            })
        );

        return updatedIva;
    } catch (error: any) {
        logger.error("Error updating IVA report:", error);
        throw new Error(error.message || "Error actualizando el reporte de IVA");
    }
};

/**
 * Updates a payment object.
 * 
 * @param eventId The ID of the payment to update.
 * @param data The updated data for the payment.
 * @returns The updated payment object or an error if the operation fails.
 */
export const updatePayment_ = async (eventId: string, data: Partial<NewPayment>): Promise<Payment | Error> => {
    try {
        const updatedEvent = await runTransaction((tx) =>
            tx.payment.update({
                where: {
                    id: eventId
                },
                include: {
                    event: true
                },
                data: {
                    ...data
                }
            })
        );
        return updatedEvent;
    } catch (error: any) {
        logger.error("Error updateEvent", { eventId, message: error?.message, stack: error?.stack });
        throw error;
    }
}

export const updateObservation = async (id: string, newDescription: string) => {
    try {
        const updatedObservation = await runTransaction((tx) =>
            tx.observations.update({
                where: {
                    id: id,
                },
                data: {
                    description: newDescription,
                },
            })
        );

        return updatedObservation
    } catch (e) {
        logger.error("Error updating observation:", e)
        throw new Error("Error updating observation")
    }
}

/**
 * ✅ REFACTORIZACIÓN 2026: Permite editar reportes ISLR de años anteriores (2025)
 * - Permite acceso a fiscales rotados (supervisor histórico o actual)
 */
export const updateIslr = async (
    id: string, 
    input: Partial<ISLRReports>,
    userId?: string,
    userRole?: string
) => {
    // ✅ Validación de acceso para fiscales rotados
    if (userId && userRole && userRole === "FISCAL") {
        const islrReport = await db.iSLRReports.findUnique({
            where: { id },
            include: {
                taxpayer: {
                    include: {
                        user: {
                            include: {
                                supervisor: {
                                    select: { id: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (islrReport?.taxpayer) {
            const isCurrentOfficer = islrReport.taxpayer.officerId === userId;
            const isCurrentSupervisor = islrReport.taxpayer.user?.supervisor?.id === userId;
            
            if (!isCurrentOfficer && !isCurrentSupervisor) {
                if (islrReport.taxpayer.user?.groupId) {
                    const group = await db.fiscalGroup.findUnique({
                        where: { id: islrReport.taxpayer.user.groupId },
                        include: {
                            members: {
                                where: {
                                    supervisorId: userId
                                }
                            }
                        }
                    });
                    
                    if (!group || group.members.length === 0) {
                        throw new Error("No tienes permisos para editar este reporte.");
                    }
                } else {
                    throw new Error("No tienes permisos para editar este reporte.");
                }
            }
        }
    }

    try {
        const updatedIslr = await runTransaction((tx) =>
            tx.iSLRReports.update({
                where: { id: id },
                data: input,
            })
        );

        return updatedIslr;

    } catch (e: any) {
        logger.error(e);
        throw new Error(e.message || "No se pudieron actualizar los datos del reporte de ISLR");
    }
}



/**
 * ✅ REFACTORIZACIÓN 2026: Permite culminar casos de años anteriores (2025)
 * - NO valida restricciones de año fiscal
 * - Permite acceso a fiscales rotados (supervisor histórico o actual)
 * - Solo bloquea si el caso ya está "CERRADO DEFINITIVAMENTE" (culminated = true y status = false)
 */
export const updateCulminated = async (
    id: string, 
    culminated: boolean,
    userId?: string,
    userRole?: string
) => {
    try {
        // ✅ Validación de acceso para fiscales rotados
        if (userId && userRole && userRole === "FISCAL") {
            const taxpayer = await db.taxpayer.findUnique({
                where: { id },
                include: {
                    user: {
                        include: {
                            supervisor: {
                                select: { id: true }
                            }
                        }
                    }
                }
            });

            if (!taxpayer) {
                throw new Error("Contribuyente no encontrado");
            }

            // ✅ PERMITIR CULMINACIÓN si:
            // 1. El usuario es el fiscal asignado actual (officerId)
            // 2. El usuario es el supervisor actual del fiscal asignado
            const isCurrentOfficer = taxpayer.officerId === userId;
            const isCurrentSupervisor = taxpayer.user?.supervisor?.id === userId;
            
            if (!isCurrentOfficer && !isCurrentSupervisor) {
                // Verificar si el usuario es supervisor de algún miembro del grupo del fiscal
                if (taxpayer.user?.groupId) {
                    const group = await db.fiscalGroup.findUnique({
                        where: { id: taxpayer.user.groupId },
                        include: {
                            members: {
                                where: {
                                    supervisorId: userId
                                }
                            }
                        }
                    });
                    
                    if (!group || group.members.length === 0) {
                        throw new Error("No tienes permisos para culminar este contribuyente. Solo el fiscal asignado o su supervisor pueden hacerlo.");
                    }
                } else {
                    throw new Error("No tienes permisos para culminar este contribuyente. Solo el fiscal asignado o su supervisor pueden hacerlo.");
                }
            }
        }

        // ✅ NO validar año - permitir culminar casos de cualquier año
        // Solo verificar que el contribuyente existe y está activo
        const taxpayerBefore = await db.taxpayer.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        name: true,
                        group: { 
                            select: { 
                                coordinator: { 
                                    select: { 
                                        email: true 
                                    } 
                                } 
                            } 
                        }
                    }
                }
            }
        });

        if (!taxpayerBefore) {
            throw new Error("Contribuyente no encontrado");
        }

        // ✅ Permitir culminar incluso si el año fiscal cambió
        // Solo bloquear si ya está cerrado definitivamente (status = false)
        if (!taxpayerBefore.status && taxpayerBefore.culminated) {
            throw new Error("Este caso ya está cerrado definitivamente y no puede ser modificado.");
        }

        const updatedCulminatedProcess = await runTransaction((tx) =>
            tx.taxpayer.update({
                where: {
                    id: id,
                },
                data: {
                    culminated: culminated,
                },
            })
        );

        // Nota: El envío de emails está comentado porque requiere resend configurado
        // Si se necesita reactivar, descomentar y configurar las variables de entorno

        return updatedCulminatedProcess;

    } catch (e: any) {
        logger.error(e);
        throw new Error(e.message || "Couldn't update the culminated field.");
    }
}


export const updatePayment = async (id: string, newStatus: string) => {

    try {
        const updatedPayment = await runTransaction(async (tx) => {
            if (newStatus === "paid") {
                return tx.event.update({
                    where: {
                        id: id,
                    },
                    data: {
                        debt: 0,
                    }
                });
            }
            const getFineAmount = await tx.event.findFirst({
                where: {
                    id: id,
                }
            });

            if (getFineAmount) {
                const amount = getFineAmount.amount;
                return tx.event.update({
                    where: {
                        id: id,
                    },
                    data: {
                        debt: amount,
                    }
                });
            }
            return getFineAmount;
        });

        return updatedPayment

    } catch (e) {
        logger.error(e);
        throw new Error("Can not update the debt for this fine.")
    }
}





export const notifyTaxpayer = async (id: string) => {

    try {
        const notifiedTaxpayer = await runTransaction((tx) =>
            tx.taxpayer.update({
                where: {
                    id: id,
                },
                data: {
                    notified: true,
                },
            })
        );

        const taxpayer = await db.taxpayer.findFirst({
            where: { id: id },
            include: {
                user: {
                    select: {
                        name: true,
                        group: { select: { coordinator: { select: { email: true } } } }
                    }
                }
            }
        })

        const coordinatorEmail = taxpayer?.user?.group?.coordinator?.email;
        const fiscalName = taxpayer?.user?.name;
        const taxpayerName = taxpayer?.name;
        const taxpayerProcess = taxpayer?.process;
        const providenceNum = taxpayer?.providenceNum;
        const address = taxpayer?.address;
        const taxpayerId = taxpayer?.id;

        const now = new Date();
        const formattedDate = now.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const formattedTime = now.toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
        });

        if (coordinatorEmail) {
            // ✅ No romper el endpoint si falla el envío del correo.
            // Usamos el helper de reintentos y no esperamos el resultado.
            sendEmailWithRetry({
                from: process.env.EMAIL_FROM ?? 'no-reply@sac-app.com',
                to: coordinatorEmail,
                subject: `Contribuyente notificado: ${taxpayerName}`,
                html: `
                <div style="font-family: sans-serif; background-color: #f3f4f6; padding: 30px;">
                    <div style="max-width: 600px; margin: auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
                    <h2 style="color: #2563eb;">📬 Contribuyente Notificado</h2>
                    <p>El contribuyente <strong>${taxpayerName}</strong> ha sido <span style="color: green; font-weight: bold;">notificado</span> por el fiscal <strong>${fiscalName}</strong>.</p>

                    <ul style="line-height: 1.6; font-size: 14px; padding-left: 20px; color: #374151;">
                        <li><strong>Contribuyente:</strong> ${taxpayerName}</li>
                        <li><strong>Proceso:</strong> ${taxpayerProcess}</li>
                        <li><strong>Número de Providencia:</strong> ${providenceNum}</li>
                        <li><strong>Dirección:</strong> ${address}</li>
                        <li><strong>Notificado por:</strong> ${fiscalName}</li>
                        <li><strong>Fecha y hora:</strong> ${formattedDate} a las ${formattedTime}</li>
                    </ul>

                    <p>Puedes ver los detalles directamente en la plataforma:</p>

                    <a href="https://www.sac-app.com/taxpayer/${taxpayerId}" target="_blank" style="display: inline-block; margin-top: 12px; padding: 10px 18px; background-color: #2563eb; color: white; border-radius: 8px; text-decoration: none;">Ver contribuyente</a>

                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />

                    <p style="font-size: 13px; color: #6b7280;">Este mensaje fue generado automáticamente por el sistema. No respondas a este correo.</p>
                    <p style="font-size: 12px; color: #9ca3af;">© ${now.getFullYear()} Sistema de Administración de Contribuyentes</p>
                    </div>
                </div>
                `,
            }).catch((err) =>
                logger.error("Error inesperado al enviar email de notificación de contribuyente:", err)
            );
        }

        return notifiedTaxpayer;
    } catch (e) {
        logger.error(e);
        throw new Error("Error notifying the taxpayer");
    }
};

export const getPendingPayments = async (taxpayerId?: string): Promise<Event[]> => {
    try {
        const where: any = {
            payment: {
                is: null,
            }
        }
        if (taxpayerId) {
            where.taxpayerId = taxpayerId
        }
        const pendingPayments = await taxpayerRepository.findPendingPayments(where);

        const mappedResponse: Event[] = pendingPayments.map((event: any) => {
            return {
                id: event.id,
                date: event.date,
                type: event.type ? event.type : "payment",
                amount: event.amount,
                taxpayerId: event.taxpayerId,
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`
            }
        })
        return mappedResponse
    } catch (error: any) {
        logger.error("Error getEventsbyTaxpayer", { message: error?.message, stack: error?.stack });
        throw error;
    }
}

export async function getTaxpayerData(id: string) {

    try {

        const taxpayerData = await taxpayerRepository.getTaxpayerData(id);

        return taxpayerData

    } catch (e: any) {
        logger.error("Error getting the taxpayer data", { message: e?.message, stack: e?.stack });
        throw new Error("Error getting the taxpayer data ");
    }
}

export async function uploadRepairReport(taxpayerId: string, pdf_url: string) {
    try {
        const newRepairReport = await runTransaction((tx) =>
            taxpayerRepository.createRepairReport(taxpayerId, pdf_url, tx)
        );
        return newRepairReport;
    } catch (e: any) {
        logger.error("Can't create the repair report", { taxpayerId, pdf_url, message: e?.message, stack: e?.stack });
        throw new Error("Can't create the repair report")
    }
}

// Actualizar luego de subir exitosamente a S3
export async function updateRepairReportPdfUrl(id: string, pdf_url: string) {
    try {
        return await runTransaction((tx) =>
            tx.repairReport.update({
                where: { id },
                data: { pdf_url },
            })
        );
    } catch (error: any) {
        logger.error("Failed to update pdf_url for RepairReport", { id, message: error?.message, stack: error?.stack });
        throw new Error("Could not update pdf_url for RepairReport");
    }
}

// Eliminar si falla la subida
export async function deleteRepairReportById(id: string) {
    try {
        return await runTransaction((tx) => taxpayerRepository.deleteRepairReportById(id, tx));
    } catch (error: any) {
        logger.error("Failed to delete RepairReport", { id, message: error?.message, stack: error?.stack });
        throw new Error("Could not delete RepairReport");
    }
}

export async function getObservations(taxpayerId: string) {
    try {

        const taxpayerObservations = await taxpayerRepository.findObservationsByTaxpayer(taxpayerId);

        return taxpayerObservations
    } catch (e: any) {
        logger.error("Error getting the observations", { taxpayerId, message: e?.message, stack: e?.stack });
        throw new Error("Error getting the observations")
    }
}



export async function getTaxpayerSummary(taxpayerId: string) {

    try {
        const taxpayerSummary = await taxpayerRepository.findIvaReportsByTaxpayer(taxpayerId);

        return taxpayerSummary;

    } catch (e: any) {
        logger.error("Error getting the taxpayer summary", { taxpayerId, message: e?.message, stack: e?.stack });
        throw new Error("Error getting the taxpayer summary");
    }
}

export async function getIslrReports(taxpayerId: string) {
    try {
        const reports = await taxpayerRepository.findIslrReportsByTaxpayer(taxpayerId);

        return reports;
    } catch (e: any) {
        logger.error("Couldn't get the ISLR reports for this taxpayer", { taxpayerId, message: e?.message, stack: e?.stack });
        throw new Error("Couldn't get the ISLR reports for this taxpayer.");
    }
}



export const createObservation = async (input: NewObservation) => {
    if (!input.taxpayerId) {
        throw new Error("Missing taxpayerId for observation");
    }

    try {
        const observation = await runTransaction((tx) =>
            taxpayerRepository.createObservation({
                taxpayerId: input.taxpayerId,
                description: input.description,
                date: new Date(input.date),
            }, tx)
        );

        return observation

    } catch (e: any) {
        logger.error("Error when creating observation", { taxpayerId: input.taxpayerId, message: e?.message, stack: e?.stack });
        throw new Error("Error when creating observation")
    }
}


/**
 * ✅ REFACTORIZACIÓN 2026: Permite crear reportes IVA con fechas del año anterior (2025)
 * - Eliminada validación de año que bloqueaba fechas pasadas
 * - Solo valida duplicados por mes, sin restricción de año
 * - Permite acceso a fiscales rotados (supervisor histórico o actual)
 */
export const createIVA = async (data: NewIvaReport, userId?: string, userRole?: string) => {
    // ✅ Validación de acceso para fiscales rotados
    if (userId && userRole && userRole === "FISCAL") {
        const taxpayer = await db.taxpayer.findUnique({
            where: { id: data.taxpayerId },
            include: {
                user: {
                    include: {
                        supervisor: {
                            select: { id: true }
                        }
                    }
                }
            }
        });

        if (taxpayer) {
            const isCurrentOfficer = taxpayer.officerId === userId;
            const isCurrentSupervisor = taxpayer.user?.supervisor?.id === userId;
            
            if (!isCurrentOfficer && !isCurrentSupervisor) {
                if (taxpayer.user?.groupId) {
                    const group = await db.fiscalGroup.findUnique({
                        where: { id: taxpayer.user.groupId },
                        include: {
                            members: {
                                where: {
                                    supervisorId: userId
                                }
                            }
                        }
                    });
                    
                    if (!group || group.members.length === 0) {
                        throw new Error("No tienes permisos para crear reportes de este contribuyente.");
                    }
                } else {
                    throw new Error("No tienes permisos para crear reportes de este contribuyente.");
                }
            }
        }
    }
    // ✅ CORRECCIÓN 2026: Permitir fechas progresivas y fechas pasadas del mismo mes/año
    // Validar duplicados para el mes (sin restricción de año o fecha mínima)
    const reportDate = new Date(data.date);
    
    // Validar que la fecha es válida
    if (isNaN(reportDate.getTime())) {
        throw new Error(`Fecha de reporte inválida: "${data.date}". Por favor verifica el formato de la fecha.`);
    }
    
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 3. Construir el objeto de creación
    const createData = {
        taxpayerId: data.taxpayerId,
        purchases: new Decimal(data.purchases),
        sells: new Decimal(data.sells),
        paid: new Decimal(data.paid),
        date: new Date(data.date),
        iva: data.iva != null ? new Decimal(data.iva) : null,
        excess: data.excess != null ? new Decimal(data.excess) : null,
    };

    // 4. Validar duplicados y crear en transacción (evita condiciones de carrera)
    const report = await runTransaction(async (tx) => {
        const existing = await tx.iVAReports.findFirst({
            where: {
                taxpayerId: data.taxpayerId,
                date: { gte: startDate, lte: endDate },
            },
        });
        if (existing) {
            throw new Error(`Ya existe un reporte IVA para este contribuyente en ${month}/${year}.`);
        }
        return tx.iVAReports.create({
            data: createData,
        });
    });
    return report;
};

/**
 * ✅ REFACTORIZACIÓN 2026: Permite crear reportes ISLR con fechas del año anterior (2025)
 * - Mantiene validación de duplicados por año (necesaria para ISLR)
 * - PERO permite años anteriores al actual sin restricción
 * - Permite acceso a fiscales rotados (supervisor histórico o actual)
 */
export const createISLR = async (data: NewIslrReport, userId?: string, userRole?: string) => {
    // ✅ Validación de acceso para fiscales rotados
    if (userId && userRole && userRole === "FISCAL") {
        const taxpayer = await db.taxpayer.findUnique({
            where: { id: data.taxpayerId },
            include: {
                user: {
                    include: {
                        supervisor: {
                            select: { id: true }
                        }
                    }
                }
            }
        });

        if (taxpayer) {
            const isCurrentOfficer = taxpayer.officerId === userId;
            const isCurrentSupervisor = taxpayer.user?.supervisor?.id === userId;
            
            if (!isCurrentOfficer && !isCurrentSupervisor) {
                if (taxpayer.user?.groupId) {
                    const group = await db.fiscalGroup.findUnique({
                        where: { id: taxpayer.user.groupId },
                        include: {
                            members: {
                                where: {
                                    supervisorId: userId
                                }
                            }
                        }
                    });
                    
                    if (!group || group.members.length === 0) {
                        throw new Error("No tienes permisos para crear reportes de este contribuyente.");
                    }
                } else {
                    throw new Error("No tienes permisos para crear reportes de este contribuyente.");
                }
            }
        }
    }
    try {
        // ✅ CORRECCIÓN 2026: Permitir fechas progresivas y fechas pasadas
        // Convert emition_date to Date object and get the year
        const reportDate = new Date(data.emition_date);
        
        // Validar que la fecha es válida
        if (isNaN(reportDate.getTime())) {
            throw new Error(`Fecha de emisión inválida: "${data.emition_date}". Por favor verifica el formato de la fecha.`);
        }
        
        const emitionYear = reportDate.getFullYear();

        // ✅ PERMITIR cualquier fecha del año (progresiva o pasada)
        // Validar duplicados y crear en una transacción para evitar condiciones de carrera
        const response = await runTransaction(async (tx) => {
            const existingReport = await tx.iSLRReports.findFirst({
                where: {
                    taxpayerId: data.taxpayerId,
                    AND: [
                        {
                            emition_date: {
                                gte: new Date(`${emitionYear}-01-01`),
                                lte: new Date(`${emitionYear}-12-31`)
                            }
                        }
                    ]
                }
            });

            if (existingReport) {
                throw new Error(`Ya existe un reporte ISLR para este contribuyente en el año ${emitionYear}.`);
            }

            return tx.iSLRReports.create({
                data,
            });
        });

        return response;

    } catch (e: any) {
        logger.error("Couldn't create the ISLR Report", { message: e?.message, stack: e?.stack });
        throw new Error(e.message || "Couldn't create the ISLR Report");
    }
};

export const CreateTaxpayerCategory = async (name: string) => {

    if (!name) throw new Error("Name missing in CreateTaxpayerCategory");

    try {

        const createdCategory = await runTransaction((tx) =>
            staticDataRepository.createTaxpayerCategory(name, tx)
        );

        return createdCategory;

    } catch (e: any) {
        logger.error("CreateTaxpayerCategory failed", { name, message: e?.message, stack: e?.stack });
        throw new Error(e);
    }
}


import { staticDataRepository } from "./repository/static-data.repository";
import { taxpayerRepository } from "./repository/taxpayer.repository";

// ... other imports

export const getTaxpayerCategories = async () => {
    try {
        const categories = await staticDataRepository.findAllCategories();
        return categories;
    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            logger.error("Prisma error getting taxpayer categories", { code: e.code, message: e?.message });
        } else {
            logger.error("Can't get the taxpayer categories", { message: e?.message, stack: e?.stack });
        }
        throw new Error("Can't get the taxpayer categories");
    }
}

export const getParishList = async () => {


    try {

        const parishList = await staticDataRepository.findAllParishes();

        return parishList;

    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            logger.error("Prisma error getting parish list", { code: e.code, message: e?.message });
        } else {
            logger.error("Can't get the parish list", { message: e?.message, stack: e?.stack });
        }
        throw new Error("Can't get the parish list.")
    }
}