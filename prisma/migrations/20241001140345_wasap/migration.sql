/*
  Warnings:

  - You are about to alter the column `fecha` on the `evento` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - Added the required column `status` to the `contribuyente` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `evento` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `usuario` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `contribuyente` ADD COLUMN `status` BOOLEAN NOT NULL;

-- AlterTable
ALTER TABLE `evento` ADD COLUMN `status` BOOLEAN NOT NULL,
    MODIFY `fecha` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP();

-- AlterTable
ALTER TABLE `usuario` ADD COLUMN `status` BOOLEAN NOT NULL;
