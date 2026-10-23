import { prisma } from "../db/index";

// What has money on it is kept (it may be needed for AFIP): files with payments or an
// invoice, services already paid to the wholesaler, and the pax of those files.

// Why a file can't be deleted, or null if it can
export const fileProtectionReason = async (fileId: string) => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      facturadoAt: true,
      _count: { select: { pagos: true } },
      services: { where: { pagosMayorista: { some: {} } }, select: { id: true }, take: 1 },
    },
  });
  if (!file) return null;
  if (file.facturadoAt) return "está facturado";
  if (file._count.pagos > 0) return "tiene pagos del pasajero";
  if (file.services.length > 0) return "tiene pagos a mayoristas";
  return null;
};

// Services (of the ids given) that were already paid to the wholesaler
export const servicesPaidToSupplier = (serviceIds: string[]) =>
  prisma.service.findMany({
    where: { id: { in: serviceIds }, pagosMayorista: { some: {} } },
    select: { id: true, nombre: true },
  });

// Whether the pax travels in a file with payments or an invoice
export const paxHasProtectedFiles = async (paxId: string) =>
  (await prisma.file.count({
    where: {
      clients: { some: { id: paxId } },
      OR: [{ facturadoAt: { not: null } }, { pagos: { some: {} } }],
    },
  })) > 0;
