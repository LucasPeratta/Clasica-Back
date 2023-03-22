//npx prisma db seed

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const pax1 = await prisma.pax.upsert({
    where: { id: "lucasperatta@gmail.com" },
    update: {},
    create: {
      firstname: "lucas",
      middlename: "nn",
      lastname: "peratta",
      email: "lucasperatta@gmail.com",
      dob: new Date("2002-09-01"),
      obs: "creando pax 1",
    },
  });

  const pax2 = await prisma.pax.upsert({
    where: { email: "francoperatta@hotmail.com" },
    update: {},
    create: {
      firstname: "franco",
      middlename: "nn",
      lastname: "peratta",
      email: "francoperatta@hotmail.com",
      dob: new Date("1995-06-20"),
      obs: "creando pax 2",
    },
  });

  const file1 = await prisma.file.upsert({
    where: { id: "abc123" },
    update: {},
    create: {
      id: "abc123",
      obs: "creando file 1",
      clients: { connect: { id: pax1.id } },
    },
  });

  const file2 = await prisma.file.upsert({
    where: { id: "def456" },
    update: {},
    create: {
      id: "def456",
      obs: "creando file 2",
      clients: { connect: { id: pax2.id } },
    },
  });

  const service1 = await prisma.service.upsert({
    where: { id: "xyz456" },
    update: {},
    create: {
      id: "xyz456",
      cost: 100.0,
      currency: "USD",
      provider: "ACME Inc.",
      obs: "creando service 1",
      files: { connect: { id: file1.id } },
    },
  });

  const service2 = await prisma.service.upsert({
    where: { id: "uvw789" },
    update: {},
    create: {
      id: "uvw789",
      cost: 50.0,
      currency: "PESOS",
      provider: "ACME Inc.",
      obs: "creando service 2",
      files: { connect: { id: file2.id } },
    },
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
