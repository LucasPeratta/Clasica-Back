import { prisma } from "../db/index";
import { Prisma } from "@prisma/client";
import { getCharge } from "./payments";

// Quick look at what each file charges and what the client already paid, with light queries
// (no plans or payment details). Used to skip, before the full calculation, the files that
// can't matter: e.g. trips paid long ago when looking for who still owes money.
// With years of files this keeps "Cobros", the home page and the balance fast.
export const getFileBalances = async (where: Prisma.FileWhereInput = {}) => {
  const [files, paid] = await Promise.all([
    prisma.file.findMany({
      where,
      select: {
        id: true,
        grupoId: true,
        tarifaAlternativa: true,
        tarifaAlternativaMoneda: true,
        planPersonalizado: true,
        services: { where: { deleted_at: null }, select: { currency: true, tarifa: true } },
        cuotas: { select: { importe: true } },
      },
    }),
    prisma.filePago.groupBy({ by: ["fileId"], _sum: { importeAplicado: true } }),
  ]);
  const paidByFile = new Map(paid.map((p) => [p.fileId, Number(p._sum.importeAplicado ?? 0)]));

  return files.map((file) => {
    const charge = getCharge(file);
    // With their own plan, the installments may add up to more than the total
    const planTotal = file.planPersonalizado ? file.cuotas.reduce((sum, c) => sum + Number(c.importe), 0) : 0;
    return {
      id: file.id,
      // Group reservations charge each currency apart: they always get the full calculation
      multiCurrency: !!file.grupoId,
      chargeable: charge.currency !== null,
      target: Math.max(charge.total, planTotal),
      paid: paidByFile.get(file.id) ?? 0,
    };
  });
};
