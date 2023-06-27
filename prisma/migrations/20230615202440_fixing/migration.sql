/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Pax` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Pax_email_key` ON `Pax`(`email`);
