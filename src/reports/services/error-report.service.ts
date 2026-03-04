import { db } from "../../utils/db-server";
import logger from "../../utils/logger";
import type { InputError } from "../report-utils";

/**
 * Crea un registro de error con imágenes opcionales asociadas.
 */
export const createError = async (input: InputError): Promise<InputError | Error> => {
  try {
    const createdError = await db.errors.create({
      data: {
        title: input.title ?? undefined,
        description: input.description,
        type: input.type,
        userId: input.userId,
        errorImages: {
          create:
            input.images?.map((img) => ({
              img_src: img.img_src,
              img_alt: img.img_alt,
            })) || [],
        },
      },
    });

    return createdError as unknown as InputError;
  } catch (e) {
    logger.error("[REPORTS] createError failed", {
      inputTitle: input?.title,
      inputType: input?.type,
      userId: input?.userId,
      error: e,
    });
    throw new Error("Error creating the report");
  }
};

