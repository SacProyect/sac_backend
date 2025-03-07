-- Migration for the `user` table
CREATE TABLE `user` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `personId` int NOT NULL,
  `password` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario_cedula_key` (`personId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration for the `taxpayer` table
CREATE TABLE `taxpayer` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `providenceNum` int NOT NULL,
  `process` enum('FP','AF','VDF','NA') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NA',
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rif` char(11) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contract_type` enum('SPECIAL','ORDINARY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ORDINARY',
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `officerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `contribuyente_procedimiento_idx` (`process`),
  KEY `contribuyente_tipoContrato_idx` (`contract_type`),
  KEY `contribuyente_funcionarioId_fkey` (`officerId`),
  FULLTEXT KEY `contribuyente_nombre_idx` (`name`),
  CONSTRAINT `contribuyente_funcionarioId_fkey` FOREIGN KEY (`officerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration for the `event` table
CREATE TABLE `event` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `amount` decimal(20,2) NOT NULL DEFAULT '0.00',
  `type` enum('FINE','WARNING','PAYMENT_COMPROMISE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `taxpayerId` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `evento_contribuyenteId_fkey` (`taxpayerId`),
  CONSTRAINT `evento_contribuyenteId_fkey` FOREIGN KEY (`taxpayerId`) REFERENCES `taxpayer` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Migration for the `payment` table
CREATE TABLE `payment` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `amount` decimal(20,2) NOT NULL DEFAULT '0.00',
  `date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `eventId` bigint unsigned NOT NULL,
  `taxpayerId` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `pago_id_key` (`id`),
  UNIQUE KEY `pago_eventoId_key` (`eventId`),
  KEY `pago_contribuyenteId_fkey` (`taxpayerId`),
  CONSTRAINT `pago_contribuyenteId_fkey` FOREIGN KEY (`taxpayerId`) REFERENCES `taxpayer` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `pago_eventoId_fkey` FOREIGN KEY (`eventId`) REFERENCES `event` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


