// Load test: how fast the main screens answer with years of data. npm run benchmark [-- 3000]
// Uses a separate, throwaway database ("<your database>_bench"), wiped on every run: the real
// data is never touched. Needs the local MySQL running.
import "dotenv/config";
import { execSync, spawn } from "child_process";
import bcrypt from "bcrypt";
import { PrismaClient, Currency, ServiceType } from "@prisma/client";

const PORT = "4598";
const FILES = Number(process.argv[2]) || 3000;
const DAY_MS = 24 * 60 * 60 * 1000;

const original = process.env.DB_CONNECTION_STRING;
if (!original) throw new Error("DB_CONNECTION_STRING is not set");
const url = new URL(original);
url.pathname = `${url.pathname}_bench`;
if (!url.pathname.endsWith("_bench") || url.toString() === original) throw new Error("The database name must end with _bench");
const env = { ...process.env, DB_CONNECTION_STRING: url.toString(), PORT, TS_NODE_TRANSPILE_ONLY: "true" };
const API = `http://localhost:${PORT}/api`;

const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const day = (offset: number) => new Date(Date.now() + offset * DAY_MS);
const random = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));

const seed = async () => {
  await prisma.user.create({ data: { email: "bench@clasica.com", password: await bcrypt.hash("bench-password", 10) } });

  // Half as many pax as files (people travel more than once)
  const paxCount = Math.ceil(FILES / 2);
  await prisma.pax.createMany({
    data: Array.from({ length: paxCount }, (_, i) => ({
      firstname: `Nombre${i}`,
      lastname: `Apellido${i}`,
      dni: String(20000000 + i),
      passportVto: day(random(-100, 2000)),
      dniVto: day(random(-100, 3000)),
    })),
  });
  const paxIds = (await prisma.pax.findMany({ select: { id: true } })).map((p) => p.id);

  const perYear = new Map<number, number>();
  for (let i = 0; i < FILES; i++) {
    // Trips over the last ~3 years and the next one
    const salida = random(-1000, 300);
    const creado = salida - random(30, 200);
    const currency: Currency = i % 3 === 0 ? "PESOS" : "USD";
    const scale = currency === "PESOS" ? 1000 : 1;
    const services: { type: ServiceType; neto: number; tarifa: number }[] = [
      { type: "AEREO", neto: 1000 * scale, tarifa: 1200 * scale },
      { type: "HOTEL", neto: 1500 * scale, tarifa: 1800 * scale },
      { type: "EXCURSION", neto: 200 * scale, tarifa: 260 * scale },
    ];
    const total = services.reduce((s, x) => s + x.tarifa, 0);
    const departed = salida < 0;
    const createdAt = day(creado);
    const anio = createdAt.getFullYear();
    const numero = (perYear.get(anio) ?? 0) + 1;
    perYear.set(anio, numero);

    const file = await prisma.file.create({
      data: {
        numero,
        anio,
        destino: `Destino ${i % 80}`,
        fechaSalida: day(salida),
        createdAt,
        obs: "",
        precioNetoTotal: "0",
        tarifaTotal: "0",
        clients: { connect: [{ id: paxIds[i % paxIds.length] }, { id: paxIds[(i * 7) % paxIds.length] }] },
        services: {
          create: services.map((s) => ({
            type: s.type,
            nombre: `${s.type} ${i}`,
            provider: `Mayorista ${i % 12}`,
            precioNeto: String(s.neto),
            tarifa: String(s.tarifa),
            currency,
            createdAt,
            liquidado: departed,
          })),
        },
        // Past trips: fully paid and (most) invoiced; upcoming: only the deposit
        pagos: {
          create: (departed ? [services[0].tarifa, total - services[0].tarifa] : [services[0].tarifa]).map((importe, k) => ({
            fecha: day(k === 0 ? creado + 1 : salida - 25),
            importe,
            moneda: currency,
            importeAplicado: importe,
            medio: "TRANSFERENCIA" as const,
            recibo: { create: {} },
          })),
        },
        ...(departed && i % 10 !== 0 && { facturadoAt: day(salida - 24), facturaImporte: total, facturaMoneda: currency }),
      },
      include: { services: true },
    });

    // Paid to the wholesaler: everything of past trips, flights of upcoming ones
    for (const s of file.services.filter((s) => departed || s.type === "AEREO")) {
      await prisma.pagoMayorista.create({
        data: {
          fecha: day(s.type === "AEREO" ? creado + 1 : salida - 30),
          mayorista: s.provider,
          moneda: currency,
          importe: Number(s.precioNeto),
          medio: "TRANSFERENCIA",
          aplicaciones: { create: [{ serviceId: s.id, importe: Number(s.precioNeto) }] },
        },
      });
    }
    if ((i + 1) % 500 === 0) console.log(`   ${i + 1} files...`);
  }
};

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(API);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("The server did not start");
};

const ENDPOINTS: [string, string][] = [
  ["Inicio", "/inicio"],
  ["Lista de files", "/file?page=1&search=&status=current"],
  ["Buscar files", "/file?page=1&search=Destino%201&status=current"],
  ["Lista de pasajeros", "/pax?page=1&search="],
  ["Buscar pasajero", "/pax?page=1&search=Apellido12"],
  ["Lista de servicios", "/service?page=1&search="],
  ["Cobros (quién debe)", "/cobranzas?page=1&search=&filtro=todos"],
  ["Cobros (historial)", "/cobranzas/pagos?page=1&search="],
  ["Mayoristas (pendiente)", "/mayoristas/pendientes?page=1&search="],
  ["Mayoristas (pagado)", "/mayoristas/pagos?page=1&search="],
  ["Balance (este año)", "/balance"],
];

const main = async () => {
  console.log(`Base de prueba de carga "${url.pathname.slice(1)}" (se borra y se crea de nuevo)...`);
  execSync("npx prisma db push --force-reset --skip-generate", { env, stdio: "ignore" });
  console.log(`Creando ${FILES} files con servicios, pagos y facturas...`);
  const started = Date.now();
  await seed();
  console.log(`   listo en ${Math.round((Date.now() - started) / 1000)} s\n`);

  const server = spawn(process.execPath, ["-r", "ts-node/register", "app.ts"], { env, stdio: "ignore" });
  try {
    await waitForServer();
    const login = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bench@clasica.com", password: "bench-password" }),
    });
    const { token } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };

    console.log("Pantalla                     tiempo (promedio de 3)");
    for (const [name, path] of ENDPOINTS) {
      await fetch(`${API}${path}`, { headers }); // warm up
      const times: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t = Date.now();
        const res = await fetch(`${API}${path}`, { headers });
        await res.text();
        if (!res.ok) throw new Error(`${path} -> ${res.status}`);
        times.push(Date.now() - t);
      }
      const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      console.log(`${name.padEnd(28)} ${String(avg).padStart(6)} ms`);
    }
  } finally {
    server.kill();
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
