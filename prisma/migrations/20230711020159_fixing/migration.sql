/*
  Warnings:

  - Added the required column `destino` to the `File` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fechaSalida` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `file` ADD COLUMN `destino` VARCHAR(191) NOT NULL,
    ADD COLUMN `fechaSalida` DATETIME(3) NOT NULL;
