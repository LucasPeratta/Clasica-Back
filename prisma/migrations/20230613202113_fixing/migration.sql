/*
  Warnings:

  - You are about to drop the column `cost` on the `service` table. All the data in the column will be lost.
  - Added the required column `fare` to the `File` table without a default value. This is not possible if the table is not empty.
  - Added the required column `neto` to the `Service` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `file` ADD COLUMN `fare` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `service` DROP COLUMN `cost`,
    ADD COLUMN `neto` DECIMAL(65, 30) NOT NULL;
