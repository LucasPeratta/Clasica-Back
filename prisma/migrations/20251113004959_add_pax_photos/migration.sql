-- CreateTable
CREATE TABLE `PaxPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `mimetype` VARCHAR(191) NULL,
    `size` INTEGER NULL,
    `paxId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaxPhoto_paxId_idx`(`paxId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaxPhoto` ADD CONSTRAINT `PaxPhoto_paxId_fkey` FOREIGN KEY (`paxId`) REFERENCES `Pax`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
