/*
  Warnings:

  - You are about to alter the column `fecha` on the `evento` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.

*/
-- AlterTable
ALTER TABLE `contribuyente` MODIFY `status` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `evento` MODIFY `fecha` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    MODIFY `status` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `usuario` MODIFY `status` BOOLEAN NOT NULL DEFAULT true;
