/*
  Warnings:

  - You are about to drop the column `PhoneNumber` on the `pax` table. All the data in the column will be lost.
  - Added the required column `phoneNumber` to the `Pax` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `pax` DROP COLUMN `PhoneNumber`,
    ADD COLUMN `phoneNumber` VARCHAR(191) NOT NULL;
