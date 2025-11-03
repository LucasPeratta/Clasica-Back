// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const pax1 = await prisma.pax.upsert({
    where: { email: "lucasperatta@gmail.com" },
    update: {},
    create: {
      firstname: "Lucas",
      lastname: "Peratta",
      dni: "12345678",
      passport: "AA123456",
      dob: new Date("2002-09-01"),
      adress: "Bahía Blanca",
      email: "lucasperatta@gmail.com",
      phoneNumber: "2910000000",
      obs: "Pax inicial de prueba",
    },
  });

  const pax2 = await prisma.pax.upsert({
    where: { email: "francoperatta@hotmail.com" },
    update: {},
    create: {
      firstname: "Franco",
      lastname: "Peratta",
      dni: "98765432",
      passport: "BB987654",
      dob: new Date("1995-06-20"),
      adress: "Bahía Blanca",
      email: "francoperatta@hotmail.com",
      phoneNumber: "2911111111",
      obs: "Pax secundario de prueba",
    },
  });

  const service1 = await prisma.service.upsert({
    where: { id: "srv1" },
    update: {},
    create: {
      id: "srv1",
      provider: "ACME Travel",
      precioNeto: "100.00",
      tarifa: "150.00",
      currency: "USD",
      obs: "Servicio aéreo",
    },
  });

  const service2 = await prisma.service.upsert({
    where: { id: "srv2" },
    update: {},
    create: {
      id: "srv2",
      provider: "Hotel Sol",
      precioNeto: "50.00",
      tarifa: "80.00",
      currency: "PESOS",
      obs: "Alojamiento 3 noches",
    },
  });

  const file1 = await prisma.file.upsert({
    where: { id: "file1" },
    update: {},
    create: {
      id: "file1",
      obs: "Archivo inicial",
      precioNetoTotal: "150.00",
      tarifaTotal: "230.00",
      destino: "Buenos Aires",
      fechaSalida: new Date("2025-10-01"),
      clients: { connect: [{ id: pax1.id }] },
      services: { connect: [{ id: service1.id }] },
    },
  });

  const file2 = await prisma.file.upsert({
    where: { id: "file2" },
    update: {},
    create: {
      id: "file2",
      obs: "Archivo secundario",
      precioNetoTotal: "50.00",
      tarifaTotal: "80.00",
      destino: "Córdoba",
      fechaSalida: new Date("2025-10-15"),
      clients: { connect: [{ id: pax2.id }] },
      services: { connect: [{ id: service2.id }] },
    },
  });

  console.log("✅ Seed ejecutado correctamente");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
