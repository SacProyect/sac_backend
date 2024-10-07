/*
  Warnings:

  - You are about to alter the column `monto` on the `pago` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(20,2)`.

*/
-- AlterTable
ALTER TABLE `evento` MODIFY `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `pago` MODIFY `monto` DECIMAL(20, 2) NOT NULL DEFAULT 0,
    MODIFY `fecha` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
