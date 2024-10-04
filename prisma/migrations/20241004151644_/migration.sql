-- CreateTable
CREATE TABLE `usuario` (
    `id` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL,
    `cedula` INTEGER NOT NULL,
    `contrasena` VARCHAR(191) NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `usuario_cedula_key`(`cedula`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contribuyente` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `nroProvidencia` INTEGER NOT NULL,
    `procedimiento` ENUM('FP', 'AF', 'VDF', 'NA') NOT NULL DEFAULT 'NA',
    `nombre` VARCHAR(191) NOT NULL,
    `rif` CHAR(11) NOT NULL,
    `tipoContrato` ENUM('ESPECIAL', 'ORDINARIO') NOT NULL DEFAULT 'ORDINARIO',
    `status` BOOLEAN NOT NULL DEFAULT true,
    `funcionarioId` VARCHAR(191) NULL,

    INDEX `contribuyente_procedimiento_idx`(`procedimiento`),
    INDEX `contribuyente_tipoContrato_idx`(`tipoContrato`),
    FULLTEXT INDEX `contribuyente_nombre_idx`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `evento` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `monto` DECIMAL(20, 2) NOT NULL DEFAULT 0,
    `tipo` ENUM('MULTA', 'AVISO', 'COMPROMISO_PAGO') NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `contribuyenteId` BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pago` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `monto` DECIMAL(65, 30) NOT NULL,
    `fecha` DATE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` BOOLEAN NOT NULL DEFAULT true,
    `eventoId` BIGINT UNSIGNED NOT NULL,
    `contribuyenteId` BIGINT UNSIGNED NOT NULL,

    UNIQUE INDEX `pago_id_key`(`id`),
    UNIQUE INDEX `pago_eventoId_key`(`eventoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contribuyente` ADD CONSTRAINT `contribuyente_funcionarioId_fkey` FOREIGN KEY (`funcionarioId`) REFERENCES `usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `evento` ADD CONSTRAINT `evento_contribuyenteId_fkey` FOREIGN KEY (`contribuyenteId`) REFERENCES `contribuyente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pago` ADD CONSTRAINT `pago_contribuyenteId_fkey` FOREIGN KEY (`contribuyenteId`) REFERENCES `contribuyente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pago` ADD CONSTRAINT `pago_eventoId_fkey` FOREIGN KEY (`eventoId`) REFERENCES `evento`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
