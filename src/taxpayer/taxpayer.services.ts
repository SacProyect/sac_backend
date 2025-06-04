import { db } from "../utils/db.server";
import { Event, NewEvent, NewFase, NewIslrReport, NewIvaReport, NewObservation, NewPayment, NewTaxpayer, NewTaxpayerExcelInput, Payment, StatisticsResponse, Taxpayer } from "./taxpayer.utils";
import { BadRequestError } from "../utils/errors/BadRequestError";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Resend } from 'resend';
import {
    getSignedUrl,
    S3RequestPresigner,
} from "@aws-sdk/s3-request-presigner";


const resend = new Resend(process.env.RESEND_API_KEY);
const s3 = new S3Client({ region: "us-east-2" });



export async function generateDownloadUrl(key: string) {
    try {
        const command = new GetObjectCommand({
            Bucket: "sacbucketgeneral",
            Key: key, // Ej: "reparos/acta-123.pdf"
            ResponseContentDisposition: "attachment",
        });

        const url = await getSignedUrl(s3, command, { expiresIn: 180 }); // 3 minutes
        return url;
    } catch (error) {
        console.error("Error generating signed URL for key:", key, error);
        throw new Error("No se pudo generar la URL de descarga.");
    }
}


// Helper para 'dormir' N milisegundos
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendEmailWithRetry(
    params: Parameters<typeof resend.emails.send>[0],
    retries = 3,
    delayMs = 3000
) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await resend.emails.send(params);
        } catch (err) {
            console.error(`Intento ${attempt} de envío de email fallido:`, err);
            if (attempt < retries) {
                // espera antes del próximo intento
                await sleep(delayMs);
            } else {
                // tras último intento, registra error y sigue adelante
                console.error("Todos los intentos de envío de email han fallado.");
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

        // console.log("Received input:", JSON.stringify(input, null, 2));

        const userName = await db.user.findFirst(({
            where: {
                id: input.userId,
            },
            select: {
                name: true,
            }

        }))

        // Buscamos todos los contribuyentes con el mismo providenceNum
        const provCandidates = await db.taxpayer.findMany({
            where: { providenceNum: input.providenceNum },
            select: { process: true, emition_date: true }
        });

        const inputYear = new Date(input.emition_date).getFullYear();

        for (const cand of provCandidates) {
            const existingProcess = cand.process;
            const incomingProcess = input.process;
            const existingYear = new Date(cand.emition_date).getFullYear();

            const sameYear = inputYear === existingYear;
            const sameProcess = existingProcess === incomingProcess;
            const combination = [existingProcess, incomingProcess].sort().join('|');

            // Caso 1: Mismo proceso y mismo año => no permitido
            if (sameProcess && sameYear) {
                throw new Error(`Ya existe un contribuyente con proceso ${existingProcess} y el mismo número de providencia en el mismo año.`);
            }

            // Caso 2: AF y VDF en el mismo año => no permitido
            if (combination === 'AF|VDF' && sameYear) {
                throw new Error(`No puedes registrar un ${incomingProcess} si ya existe un ${existingProcess} con el mismo número de providencia en el mismo año.`);
            }

            // Caso 3: FP + FP en el mismo año => no permitido
            if (existingProcess === 'FP' && incomingProcess === 'FP' && sameYear) {
                throw new Error(`No puedes registrar dos FP con el mismo número de providencia en el mismo año.`);
            }

            // Caso 4: FP con AF o VDF en el mismo año => permitido (no se bloquea)
        }


        // const existingTaxpayer = await db.taxpayer.findUnique({
        //     where: {
        //         rif: input.rif,
        //     }
        // })

        // if (existingTaxpayer) throw new Error("El rif ya fue registrado, por favor, corrija el número de rif.")

        // Ensure at least one PDF is provided
        if (!input.pdfs || input.pdfs.length === 0) {
            throw new Error("At least one PDF must be uploaded.");
        }

        const emitionDate = new Date(input.emition_date);

        if (input.role !== "ADMIN") {
            // Normalizamos el nuevo nombre (quitando espacios y a minúsculas)
            const normalizedNew = input.name.replace(/\s+/g, "").toLowerCase();

            // Extraemos la primera palabra para acotar la búsqueda
            const firstWord = input.name.trim().split(/\s+/)[0];

            // 1) Traemos candidatos que contengan esa primera palabra
            const candidates = await db.taxpayer.findMany({
                where: {
                    name: { contains: firstWord },
                },
                select: {
                    name: true,
                    emition_date: true,
                    process: true,
                },
            });

            // 2) Filtramos aquellos cuya normalización coincida exactamente
            const sameName = candidates
                .filter((c) =>
                    c.name.replace(/\s+/g, "").toLowerCase() === normalizedNew
                )
                .sort(
                    (a, b) =>
                        new Date(b.emition_date).getTime() -
                        new Date(a.emition_date).getTime()
                );

            const lastSame = sameName[0];
            if (lastSame) {
                const newDate = new Date(input.emition_date);
                const prevDate = new Date(lastSame.emition_date);
                // Diferencia en meses aproximada
                const diffMonths =
                    (newDate.getTime() - prevDate.getTime()) /
                    (1000 * 60 * 60 * 24 * 30);
                // Umbral: 14 para VDF/FP, 15 para AF
                const threshold = ["VDF", "FP"].includes(input.process) ? 14 : 15;

                if (diffMonths < threshold) {
                    throw new Error(
                        `No puede crear un contribuyente con nombre "${input.name}" porque el último con ese nombre fue registrado hace ${Math.floor(
                            diffMonths
                        )} meses (mínimo requerido: ${threshold} meses).`
                    );
                }
            }
        }

        const taxpayer = await db.taxpayer.create({
            data: {
                providenceNum: input.providenceNum,
                process: input.process,
                name: input.name,
                contract_type: input.contract_type,
                officerId: input.officerId,
                rif: input.rif,
                address: input.address,
                emition_date: emitionDate.toISOString(),
            }
        })



        // Insert PDFs linked to this taxpayer
        await db.investigationPdf.createMany({
            data: input.pdfs.map((pdf) => ({
                pdf_url: pdf.pdf_url,
                taxpayerId: taxpayer.id,
            })),
        });

        // 3) Si es AF, enviamos email
        if (input.process === "AF") {
            // buscamos el usuario "officer"
            const officer = await db.user.findUnique({
                where: { id: input.officerId },
                include: {
                    group: {
                        include: {
                            coordinator: {
                                select: { email: true }
                            }
                        }
                    }
                }
            });

            const fiscalName = (await db.user.findUnique({
                where: { id: input.userId },
                select: { name: true }
            }))?.name ?? "—";

            const admins = await db.user.findMany({
                where: {
                    role: "ADMIN",
                }
            })

            const fromAddress = process.env.EMAIL_FROM ?? 'no-reply@sac-app.com';
            const recipients = [
                // address admins in the email
                ...admins.map(admin => admin.email),
                // if coordinator exists, add it on the list of receivers
                ...(officer?.group?.coordinator?.email ? [officer.group.coordinator.email] : [])
            ];

            const contractTypeMap: Record<string, string> = {
                SPECIAL: "ESPECIAL",
                ORDINARY: "ORDINARIO",
            };

            const displayContractType =
                contractTypeMap[input.contract_type] ?? input.contract_type;


            const emailHtml = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #2c3e50;">🆕 Nuevo Contribuyente para Auditoría Fiscal</h2>
                <p><strong>Fiscal Responsable:</strong> ${fiscalName}</p>
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

            // disparamos el envío sin bloquear la creación
            sendEmailWithRetry({
                from: fromAddress,
                to: recipients,
                subject: '🔍 Nuevo contribuyente creado para Auditoría Fiscal',
                html: emailHtml
            }).catch(err => console.error("Error inesperado al enviar email:", err));
        }

        return taxpayer;

    } catch (error: any) {
        console.error(error)
        throw error;
    }
}

export const updateFase = async (data: NewFase) => {
    try {
        // Obtener al contribuyente antes de hacer el update para comparar fases
        const taxpayerBefore = await db.taxpayer.findUnique({
            where: { id: data.id },
            include: {
                user: {
                    include: {
                        group: {
                            include: {
                                coordinator: true, // para acceder al coordinador del grupo
                            },
                        },
                    },
                },
            },
        });

        if (!taxpayerBefore) {
            throw new Error('Taxpayer not found');
        }

        const oldFase = taxpayerBefore.fase.replace("_", " ");

        // Actualizar la fase
        const updatedTaxpayerFase = await db.taxpayer.update({
            where: {
                id: data.id,
            },
            data: {
                fase: data.fase,
            },
        });

        // Obtener todos los admins
        const adminUsers = await db.user.findMany({
            where: { role: 'ADMIN' },
            select: { email: true },
        });

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
        await resend.emails.send({
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
        });

        return updatedTaxpayerFase;
    } catch (e) {
        console.error(e);
        throw new Error('Could not update the fase');
    }
};


// export const createTaxpayerExcel = async (data: NewTaxpayerExcelInput) => {
//     const {
//         providenceNum,
//         process,
//         name,
//         rif,
//         contract_type,
//         officerName,
//         address,
//         emition_date,
//     } = data;

//     try {
//         // Traemos todos los usuarios para hacer una comparación manual del nombre
//         const users = await db.user.findMany();

//         // Normalizamos los nombres y buscamos coincidencias exactas (sin importar mayúsculas/minúsculas ni tildes)
//         const normalizedInputName = normalize(officerName);
//         const matchedOfficer = users.find((u) => normalize(u.name) === normalizedInputName);

//         if (!matchedOfficer) {
//             throw new Error(`No officer found with name similar to "${officerName}"`);
//         }

//         // Creamos el nuevo contribuyente
//         const newTaxpayer = await db.taxpayer.create({
//             data: {
//                 providenceNum,
//                 process: process as any,
//                 name,
//                 rif,
//                 contract_type: contract_type as any,
//                 officerId: matchedOfficer.id,
//                 address,
//                 emition_date: new Date(emition_date),
//             },
//         });

//         return newTaxpayer;
//     } catch (error: any) {
//         console.error("Error creating taxpayer:", error);

//         // Prisma client error
//         if (error.code === 'P2002') {
//             // Unique constraint failed (por ejemplo, rif duplicado)
//             throw new Error(`A taxpayer with this RIF already exists: ${rif}`);
//         }

//         // Validación de fecha inválida
//         if (error instanceof RangeError && error.message.includes("Invalid time value")) {
//             throw new Error(`Invalid emition_date: "${emition_date}"`);
//         }

//         // Prisma validation error
//         if (error.name === "PrismaClientValidationError") {
//             throw new Error(`Invalid data sent to database: ${error.message}`);
//         }

//         // Otro error genérico
//         throw new Error(error.message || "Unknown error creating taxpayer");
//     }
// }

// Función para normalizar strings (quita mayúsculas y tildes)
function normalize(str: string): string {
    return str
        .normalize("NFD") // Separa letras de sus tildes
        .replace(/[\u0300-\u036f]/g, "") // Elimina los caracteres de tilde
        .toLowerCase()
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

        // console.log("INPUT: " + JSON.stringify(input))

        if (input.type == "PAYMENT_COMPROMISE") {
            const verifyEvent = await db.event.findUnique({
                where: { id: input.fineEventId }
            })

            if (verifyEvent) {
                if (input.amount !== undefined && input.amount > verifyEvent.debt) {
                    throw BadRequestError("AmountError", "Amount can't be greater than the debt of the fine")
                }
            }
        }

        // Set expires_at to 25 days from now if it's not provided
        const expiresAt = input.expires_at ?? new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);


        const event = await db.event.create({
            data: {
                ...input,
                expires_at: expiresAt,
            }
        })


        return event;

    } catch (error) {
        console.error("Error creating event: " + error)
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

        const verifyPayment = await db.event.findFirst({
            where: { id: input.eventId }
        })

        if (verifyPayment) {
            if (verifyPayment.debt < input.amount) {
                throw BadRequestError("AmountError", "Payment can't be greater than debt")
            }
        }

        const newPayment = await db.payment.create({
            data: input,
            include: {
                event: true
            }
        })

        await db.event.update({
            where: { id: input.eventId },
            data: { debt: { decrement: input.amount } }
        })


        return newPayment
    } catch (error) {
        throw error;
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
            events = await db.event.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    taxpayerId: true,
                    debt: true,
                    description: true,
                    taxpayer: {
                        select: {
                            name: true,
                            rif: true,
                        }
                    }

                }
            })
        } else if (type === "payment") {
            events = await db.payment.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    event: true,
                    taxpayerId: true,
                    taxpayer: {
                        select: {
                            name: true,
                            rif: true,
                        }
                    }

                }
            })
        } else {
            events = await db.event.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    taxpayerId: true,
                    description: true,
                    debt: true,
                    taxpayer: {
                        select: {
                            name: true,
                            rif: true,
                        }
                    }

                }
            })

            const payments = await db.payment.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    event: true,
                    taxpayerId: true,
                    taxpayer: {
                        select: {
                            name: true,
                            rif: true,
                        }
                    }

                }
            })

            events = [...events, ...payments]
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
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`
            }
        })

        return mappedResponse
    } catch (error) {
        console.error(error)
        throw error;
    }
}

/**
 * Gets a taxpayer by its ID.
 *
 * @param {number} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the taxpayer or an error.
 */
export const getTaxpayerById = async (taxpayerId: string): Promise<Taxpayer | Error> => {


    try {
        const taxpayer = await db.taxpayer.findUniqueOrThrow({
            where: {
                id: taxpayerId,
                status: true
            }
        });

        if (!taxpayer) {
            throw new Error(`No active taxpayer found with ID ${taxpayerId}`);
        }

        return taxpayer
    } catch (error) {
        throw error;
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
        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: userId,
                status: true
            }
        })
        return taxpayers
    } catch (error) {
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
        const updatedTaxpayer = await db.taxpayer.update({
            where: {
                id: taxpayerId
            },
            data: {
                status: false
            }
        });
        await db.event.updateMany({
            where: {
                taxpayerId: taxpayerId,
                status: true
            },
            data: {
                status: false
            }
        });
        await db.payment.updateMany({
            where: {
                taxpayerId: taxpayerId,
                status: true
            },
            data: {
                status: false
            }
        });
        return updatedTaxpayer;
    } catch (error) {
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
        const updatedEvent = await db.event.update({
            where: {
                id: eventId
            },
            data: {
                status: false
            }
        });
        return updatedEvent;
    } catch (error) {
        throw error;
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
        const updatedEvent = await db.payment.update({
            where: {
                id: eventId
            },
            include: {
                event: true
            },
            data: {
                status: false
            }
        });
        return updatedEvent;
    } catch (error) {
        throw error;
    }
}


export const deleteObservation = async (id: string) => {
    try {
        const deleteEvent = await db.observations.delete({
            where: {
                id: id,
            }
        })

        return deleteEvent;
    } catch (e) {
        console.error("Error erasing the observation: ", e);
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
export const updateTaxpayer = async (taxpayerId: string, data: Partial<NewTaxpayer>): Promise<Taxpayer | Error> => {
    try {
        const updatedTaxpayer = await db.taxpayer.update({
            where: {
                id: taxpayerId
            },
            data: {
                ...data
            }
        });
        return updatedTaxpayer;
    } catch (error) {
        throw error;
    }
}

/**
 * Updates an event object.
 * 
 * @param eventId The ID of the event to update.
 * @param data The updated data for the event.
 * @returns The updated event object or an error if the operation fails.
 */
export const updateEvent = async (eventId: string, data: Partial<NewEvent>): Promise<Event | Error> => {
    try {
        const updatedEvent = await db.event.update({
            where: {
                id: eventId
            },
            data: {
                ...data
            }
        });
        return updatedEvent;
    } catch (error) {
        throw error;
    }
}

/**
 * Updates a payment object.
 * 
 * @param eventId The ID of the payment to update.
 * @param data The updated data for the payment.
 * @returns The updated payment object or an error if the operation fails.
 */
// export const updatePayment = async (eventId: string, data: Partial<NewPayment>): Promise<Payment | Error> => {
//     try {
//         const updatedEvent = await db.payment.update({
//             where: {
//                 id: eventId
//             },
//             include: {
//                 event: true
//             },
//             data: {
//                 ...data
//             }
//         });
//         return updatedEvent;
//     } catch (error) {
//         throw error;
//     }
// }

export const updateObservation = async (id: string, newDescription: string) => {
    try {
        const updatedObservation = await db.observations.update({
            where: {
                id: id,
            },
            data: {
                description: newDescription,
            },
        })

        return updatedObservation
    } catch (e) {
        console.error("Error updating observation:", e)
        throw new Error("Error updating observation")
    }
}



export const updateCulminated = async (id: string, culminated: boolean) => {

    console.log(id);
    console.log(culminated);

    try {
        const updatedCulminatedProcess = await db.taxpayer.update({
            where: {
                id: id,
            },
            data: {
                culminated: true,
            }
        })

        return updatedCulminatedProcess;

    } catch (e) {
        console.error(e);
        throw new Error("Couldn't update the culminated field.");
    }
}


export const updatePayment = async (id: string, newStatus: string) => {

    try {
        let updatedPayment;

        if (newStatus === "paid") {
            updatedPayment = await db.event.update({
                where: {
                    id: id,
                },
                data: {
                    debt: 0,
                }
            })
        } else {
            const getFineAmount = await db.event.findFirst({
                where: {
                    id: id,
                }
            })

            if (getFineAmount) {

                const amount = getFineAmount.amount;

                updatedPayment = await db.event.update({
                    where: {
                        id: id,
                    },
                    data: {
                        debt: amount,
                    }
                })
            }
        }

        return updatedPayment

    } catch (e) {
        console.error(e);
        throw new Error("Can not update the debt for this fine.")
    }
}





export const notifyTaxpayer = async (id: string) => {

    try {
        const notifiedTaxpayer = await db.taxpayer.update({
            where: {
                id: id,
            },
            data: {
                notified: true,
            }
        })

        return notifiedTaxpayer;
    } catch (e) {
        console.error(e);
        throw new Error("error marking the taxpayer as notified")
    }
}





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
        const pendingPayments = await db.event.findMany({
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                taxpayerId: true,
                taxpayer: {
                    select: {
                        name: true,
                        rif: true,
                    }
                }

            },
            where
        })
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
    } catch (error) {
        throw error;
    }
}

export async function getTaxpayerData(id: string) {

    try {

        const taxpayerData = await db.taxpayer.findUnique({
            where: {
                id: id
            },
            include: {
                RepairReports: true,
            }
        });

        return taxpayerData

    } catch (e) {
        console.error(e);
        throw new Error("Error getting the taxpayer data ");
    }
}

export async function uploadRepairReport(taxpayerId: string, pdf_url: string) {
    try {
        const newRepairReport = await db.repairReport.create({
            data: {
                taxpayerId,
                pdf_url,
            },
        });

        return newRepairReport;

    } catch (e) {
        throw new Error("Can't create the repair report")
    }
}

// Actualizar luego de subir exitosamente a S3
export async function updateRepairReportPdfUrl(id: string, pdf_url: string) {
    try {
        return await db.repairReport.update({
            where: { id },
            data: { pdf_url },
        });
    } catch (error) {
        console.error(`❌ Failed to update pdf_url for RepairReport with ID ${id}:`, error);
        throw new Error("Could not update pdf_url for RepairReport");
    }
}

// Eliminar si falla la subida
export async function deleteRepairReportById(id: string) {
    try {
        return await db.repairReport.delete({
            where: { id },
        });
    } catch (error) {
        console.error(`❌ Failed to delete RepairReport with ID ${id}:`, error);
        throw new Error("Could not delete RepairReport");
    }
}

export async function getObservations(taxpayerId: string) {
    try {

        const taxpayerObservations = await db.observations.findMany({
            where: {
                taxpayerId: taxpayerId,
            }
        })

        return taxpayerObservations
    } catch (e) {
        console.error(e)
        throw new Error("Error getting the observations")
    }
}

export async function getTaxpayerSummary(taxpayerId: string) {

    try {
        const taxpayerSummary = await db.iVAReports.findMany({
            where: {
                taxpayerId: taxpayerId,
            }
        })

        return taxpayerSummary;

    } catch (e) {
        console.error(e);
        throw new Error("Error getting the taxpayer summary");
    }
}

export async function getIslrReports(taxpayerId: string) {
    try {
        const reports = await db.iSLRReports.findMany({
            where: {
                taxpayerId: taxpayerId,
            },
            include: {
                taxpayer: {
                    select: {
                        name: true,
                        process: true,
                    }
                }
            }
        })

        return reports;
    } catch (e) {
        console.error(e);
        throw new Error("Couldn't get the ISLR reports for this taxpayer.");
    }
}



export const createObservation = async (input: NewObservation) => {
    if (!input.taxpayerId) {
        throw new Error("Missing taxpayerId for observation");
    }

    try {
        const observation = db.observations.create({
            data: {
                taxpayerId: input.taxpayerId,
                description: input.description,
                date: new Date(input.date),
            }
        })

        return observation

    } catch (e) {
        console.error("Error", e)
        throw new Error("Error when creating observation")
    }
}


export const createIVA = async (data: NewIvaReport) => {
    // 1. Validar duplicados para el mes
    const reportDate = new Date(data.date);
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const existing = await db.iVAReports.findFirst({
        where: {
            taxpayerId: data.taxpayerId,
            date: { gte: startDate, lte: endDate },
        },
    });
    if (existing) {
        throw new Error("IVA report for this taxpayer and month already exists.");
    }

    // 2. Obtener el 'excess' del último reporte
    const latest = await db.iVAReports.findFirst({
        where: { taxpayerId: data.taxpayerId },
        orderBy: { date: 'desc' },
        select: { excess: true },
    });
    const previousExcess = latest?.excess ?? 0;

    // 3. Construir el objeto de creación
    const createData: any = {
        taxpayerId: data.taxpayerId,
        purchases: data.purchases,
        sells: data.sells,
        date: data.date,
        ...(data.iva != null && { iva: data.iva }),
        excess:
            data.excess != null
                ? data.excess
                : (() => {
                    const calculatedExcess = BigInt(previousExcess) - BigInt(data.iva);
                    return calculatedExcess > BigInt(0) ? calculatedExcess : BigInt(0);
                })(),
        paid: data.paid,
    };

    // 4. Crear y devolver
    const report = await db.iVAReports.create({
        data: createData,
    });
    return report;
};

export const createISLR = async (data: NewIslrReport) => {
    try {
        // Convert emition_date to Date object and get the year
        const emitionYear = new Date(data.emition_date).getFullYear();

        // Busca si ya existe un reporte para ese contribuyente en ese mismo año
        const existingReport = await db.iSLRReports.findFirst({
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

        // Si ya existe, lanza error
        if (existingReport) {
            throw new Error(`ISLR Report for this taxpayer in: ${emitionYear} was already created`);
        }

        // Si no existe, crea el reporte
        const response = await db.iSLRReports.create({
            data,
        });

        return response;

    } catch (e: any) {
        console.error(e);
        throw new Error(e.message || "Couldn't create the ISLR Report");
    }
};