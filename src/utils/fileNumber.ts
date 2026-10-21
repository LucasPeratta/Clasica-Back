import { Prisma } from "@prisma/client";

// Files are numbered per year of creation ("55-2026"), using Argentina's calendar so a
// file created on Dec 31 at night doesn't count for the next year (servers run in UTC)
export const yearInArgentina = (date: Date = new Date()) =>
  Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
    }).format(date)
  );

// Next number of the year; runs inside a transaction together with the create
export const nextFileNumber = async (tx: Prisma.TransactionClient, anio: number) => {
  const last = await tx.file.aggregate({ where: { anio }, _max: { numero: true } });
  return (last._max.numero ?? 0) + 1;
};

// Search conditions for a term that looks like a file number: "55" or "55-2026"
export const fileNumberConditions = (term: string): Prisma.FileWhereInput[] => {
  const withYear = term.match(/^(\d+)-(\d{4})$/);
  if (withYear) {
    return [{ numero: Number(withYear[1]), anio: Number(withYear[2]) }];
  }
  if (/^\d+$/.test(term)) {
    return [{ numero: Number(term) }];
  }
  return [];
};
