/*
Warnings:

- Added the required column `nombre` to the `Service` table without a default value. This is not possible if the table is not empty.

*/

-- Drop existing data
TRUNCATE TABLE `file`;

TRUNCATE TABLE `service`;

-- AlterTable
ALTER TABLE `file` ADD COLUMN `tarifaAlternativa` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `service` ADD COLUMN `nombre` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `file` ADD COLUMN `tarifaAlternativa` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `service` ADD COLUMN `nombre` VARCHAR(191) NOT NULL;