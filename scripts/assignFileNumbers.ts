// Gives a number ("55-2026") to files created before automatic numbering existed:
// npm run assign-file-numbers
// Files are numbered by creation date within each year, continuing after the highest
// number already used. Files that already have a number are not touched, so it can be
// run more than once. Uses the database in DB_CONNECTION_STRING (.env)
import { prisma } from "../src/db/index";
import { yearInArgentina } from "../src/utils/fileNumber";

const main = async () => {
  const files = await prisma.file.findMany({
    where: { numero: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, createdAt: true },
  });

  if (files.length === 0) {
    console.log("Todos los files ya tienen número. No se cambió nada.");
    return;
  }

  const nextByYear = new Map<number, number>();

  for (const file of files) {
    const anio = yearInArgentina(file.createdAt);

    if (!nextByYear.has(anio)) {
      const last = await prisma.file.aggregate({ where: { anio }, _max: { numero: true } });
      nextByYear.set(anio, (last._max.numero ?? 0) + 1);
    }

    const numero = nextByYear.get(anio)!;
    await prisma.file.update({ where: { id: file.id }, data: { numero, anio } });
    nextByYear.set(anio, numero + 1);
    console.log(`  ${String(numero).padStart(2, "0")}-${anio}`);
  }

  console.log(`✅ ${files.length} files numerados`);
};

main()
  .catch((error) => console.error("Error:", error))
  .finally(() => prisma.$disconnect());
