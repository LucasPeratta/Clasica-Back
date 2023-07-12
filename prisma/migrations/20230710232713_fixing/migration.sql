/*
  Warnings:

  - You are about to drop the column `fare` on the `file` table. All the data in the column will be lost.
  - You are about to drop the column `neto` on the `service` table. All the data in the column will be lost.
  - Added the required column `precioNetoTotal` to the `File` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tarifaTotal` to the `File` table without a default value. This is not possible if the table is not empty.
  - Added the required column `precioNeto` to the `Service` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tarifa` to the `Service` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `file` DROP COLUMN `fare`,
    ADD COLUMN `precioNetoTotal` VARCHAR(191) NOT NULL,
    ADD COLUMN `tarifaTotal` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `service` DROP COLUMN `neto`,
    ADD COLUMN `precioNeto` VARCHAR(191) NOT NULL,
    ADD COLUMN `tarifa` VARCHAR(191) NOT NULL;
