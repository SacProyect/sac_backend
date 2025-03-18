-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `personId` INTEGER NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `usuario_cedula_key`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
    `type` ENUM('FINE', 'WARNING', 'PAYMENT_COMPROMISE') NOT NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `taxpayerId` VARCHAR(191) NOT NULL,

    INDEX `evento_contribuyenteId_fkey`(`taxpayerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment` (
    `id` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(20, 2) NOT NULL DEFAULT 0.00,
    `date` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `status` BOOLEAN NOT NULL DEFAULT true,
    `eventId` VARCHAR(191) NOT NULL,
    `taxpayerId` VARCHAR(191) NOT NULL,
    `debt` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `payment_eventId_key`(`eventId`),
    INDEX `pago_contribuyenteId_fkey`(`taxpayerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `taxpayer` (
    `id` VARCHAR(191) NOT NULL,
    `providenceNum` INTEGER NOT NULL,
    `process` ENUM('FP', 'AF', 'VDF', 'NA') NOT NULL DEFAULT 'NA',
    `name` VARCHAR(191) NOT NULL,
    `rif` CHAR(11) NOT NULL,
    `contract_type` ENUM('SPECIAL', 'ORDINARY') NOT NULL DEFAULT 'ORDINARY',
    `status` BOOLEAN NOT NULL DEFAULT true,
    `officerId` VARCHAR(191) NULL,

    INDEX `contribuyente_funcionarioId_fkey`(`officerId`),
    INDEX `contribuyente_procedimiento_idx`(`process`),
    INDEX `contribuyente_tipoContrato_idx`(`contract_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `event` ADD CONSTRAINT `evento_contribuyenteId_fkey` FOREIGN KEY (`taxpayerId`) REFERENCES `taxpayer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment` ADD CONSTRAINT `pago_contribuyenteId_fkey` FOREIGN KEY (`taxpayerId`) REFERENCES `taxpayer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment` ADD CONSTRAINT `pago_eventoId_fkey` FOREIGN KEY (`eventId`) REFERENCES `event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `taxpayer` ADD CONSTRAINT `contribuyente_funcionarioId_fkey` FOREIGN KEY (`officerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

