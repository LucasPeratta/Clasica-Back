-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'PESOS', 'EURO');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('AEREO', 'HOTEL', 'EXCURSION', 'TRASLADO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pax" (
    "id" TEXT NOT NULL,
    "firstname" TEXT NOT NULL,
    "lastname" TEXT NOT NULL,
    "dni" TEXT,
    "passport" TEXT,
    "dob" TIMESTAMP(3),
    "adress" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "obs" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "nro" TEXT,
    "obs" VARCHAR(300),
    "precioNetoTotal" TEXT NOT NULL,
    "tarifaTotal" TEXT NOT NULL,
    "tarifaAlternativa" TEXT,
    "destino" TEXT NOT NULL,
    "fechaSalida" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "localizador" TEXT,
    "precioNeto" TEXT NOT NULL,
    "tarifa" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "type" "ServiceType" NOT NULL,
    "obs" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaxPhoto" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT,
    "size" INTEGER,
    "paxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaxPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaxPdf" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT,
    "size" INTEGER,
    "paxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaxPdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilePdf" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimetype" TEXT,
    "size" INTEGER,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilePdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_FilePax" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_FileService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pax_email_key" ON "Pax"("email");

-- CreateIndex
CREATE INDEX "PaxPhoto_paxId_idx" ON "PaxPhoto"("paxId");

-- CreateIndex
CREATE INDEX "PaxPdf_paxId_idx" ON "PaxPdf"("paxId");

-- CreateIndex
CREATE INDEX "FilePdf_fileId_idx" ON "FilePdf"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "_FilePax_AB_unique" ON "_FilePax"("A", "B");

-- CreateIndex
CREATE INDEX "_FilePax_B_index" ON "_FilePax"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_FileService_AB_unique" ON "_FileService"("A", "B");

-- CreateIndex
CREATE INDEX "_FileService_B_index" ON "_FileService"("B");

-- AddForeignKey
ALTER TABLE "PaxPhoto" ADD CONSTRAINT "PaxPhoto_paxId_fkey" FOREIGN KEY ("paxId") REFERENCES "Pax"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaxPdf" ADD CONSTRAINT "PaxPdf_paxId_fkey" FOREIGN KEY ("paxId") REFERENCES "Pax"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilePdf" ADD CONSTRAINT "FilePdf_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FilePax" ADD CONSTRAINT "_FilePax_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FilePax" ADD CONSTRAINT "_FilePax_B_fkey" FOREIGN KEY ("B") REFERENCES "Pax"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileService" ADD CONSTRAINT "_FileService_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileService" ADD CONSTRAINT "_FileService_B_fkey" FOREIGN KEY ("B") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
