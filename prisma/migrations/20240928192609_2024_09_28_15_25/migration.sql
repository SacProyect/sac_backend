-- CreateTable
CREATE TABLE `usuario` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `cedula` INTEGER NOT NULL,
    `contrasena` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contribuyente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nroProvidencia` INTEGER NOT NULL,
    `procedimiento` TEXT NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `rif` CHAR(11) NOT NULL,
    `tipoContrato` TEXT NOT NULL,
    `funcionarioId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evento` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `fecha` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP(),
    `monto` DECIMAL(20, 2) NOT NULL,
    `tipo` ENUM('MULTA', 'AVISO', 'COMPROMISO_PAGO', 'PAGO') NOT NULL,
    `contribuyenteId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contribuyente` ADD CONSTRAINT `contribuyente_funcionarioId_fkey` FOREIGN KEY (`funcionarioId`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evento` ADD CONSTRAINT `evento_contribuyenteId_fkey` FOREIGN KEY (`contribuyenteId`) REFERENCES `contribuyente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
