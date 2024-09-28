/*
  Warnings:

  - You are about to alter the column `fecha` on the `evento` table. The data in that column could be lost. The data in that column will be cast from `Timestamp(0)` to `Timestamp`.
  - A unique constraint covering the columns `[cedula]` on the table `usuario` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `evento` MODIFY `fecha` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP();

-- CreateIndex
CREATE UNIQUE INDEX `usuario_cedula_key` ON `usuario`(`cedula`);
