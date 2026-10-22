// Loads example data to try the system: npm run demo-data
// Removes it: npm run demo-data -- --borrar
// Only runs against a database on this computer (localhost). Everything it creates is
// marked with [DEMO] so it can be removed without touching real data.
import "dotenv/config";
import { Currency, File, Pax, PaymentMethod, Service, ServiceType } from "@prisma/client";
import { prisma } from "../src/db/index";
import { nextFileNumber, yearInArgentina } from "../src/utils/fileNumber";

const TAG = "[DEMO]";
const DAY_MS = 24 * 60 * 60 * 1000;

// Date `offset` days from today (negative = past)
const day = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return new Date(d.getTime() + offset * DAY_MS);
};

// Days from today until a calendar date (so most trips fall in 2027 whatever today is)
const until = (isoDate: string) => {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((new Date(`${isoDate}T12:00:00`).getTime() - today.getTime()) / DAY_MS);
};

const assertLocalDatabase = () => {
  const url = new URL(process.env.DB_CONNECTION_STRING ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`Solo se cargan datos de prueba en una base local, no en ${url.hostname}`);
  }
};

const remove = async () => {
  const files = await prisma.file.findMany({ where: { obs: { startsWith: TAG } }, include: { services: true } });
  const serviceIds = files.flatMap((f) => f.services.map((s) => s.id));
  await prisma.pagoMayorista.deleteMany({ where: { nota: { startsWith: TAG } } });
  await prisma.file.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
  const pax = await prisma.pax.deleteMany({ where: { obs: { startsWith: TAG } } });
  console.log(`🗑  Borrados ${files.length} files, ${serviceIds.length} servicios y ${pax.count} pasajeros de prueba`);
};

// 15 pasajeros. Vencimientos variados para ver los avisos de documentos
const PAX = [
  { firstname: "Martina", lastname: "Gómez", dni: "35111222", passport: "AAE111222", passportVto: day(1500), dniVto: day(2000) },
  { firstname: "Federico", lastname: "Gómez", dni: "34111333", passport: "AAE111333", passportVto: day(1500), dniVto: day(2000) },
  { firstname: "Lucía", lastname: "Fernández", dni: "38222444", passport: "AAF222444", passportVto: day(95), dniVto: day(1800) }, // pasaporte por vencer
  { firstname: "Tomás", lastname: "Fernández", dni: "40222555", passport: "AAF222555", passportVto: day(1300), dniVto: day(1800) },
  { firstname: "Sofía", lastname: "Fernández", dni: "47222666", passport: null, passportVto: null, dniVto: day(1200) },
  { firstname: "Benjamín", lastname: "Fernández", dni: "50222777", passport: null, passportVto: null, dniVto: day(1200) },
  { firstname: "Valentina", lastname: "Rodríguez", dni: "36333888", passport: "AAG333888", passportVto: day(900), dniVto: day(-20) }, // DNI vencido
  { firstname: "Joaquín", lastname: "Rodríguez", dni: "35333999", passport: "AAG333999", passportVto: day(900), dniVto: day(1500) },
  { firstname: "Camila", lastname: "López", dni: "39444111", passport: "AAH444111", passportVto: day(150), dniVto: day(1600) }, // pasaporte por vencer
  { firstname: "Mateo", lastname: "Martínez", dni: "33555222", passport: "AAJ555222", passportVto: day(40), dniVto: day(1700) }, // vence antes del viaje a NY
  { firstname: "Florencia", lastname: "Sánchez", dni: "37666333", passport: "AAK666333", passportVto: day(1400), dniVto: day(1700) },
  { firstname: "Nicolás", lastname: "Sánchez", dni: "36666444", passport: "AAK666444", passportVto: day(1400), dniVto: day(1700) },
  { firstname: "Agustina", lastname: "Pérez", dni: "41777555", passport: "AAL777555", passportVto: day(1100), dniVto: day(1900) },
  { firstname: "Santiago", lastname: "Díaz", dni: "32888666", passport: null, passportVto: null, dniVto: day(1000) },
  { firstname: "Julieta", lastname: "Romero", dni: "42999777", passport: "AAM999777", passportVto: day(1250), dniVto: day(2100) },
];

interface DemoService {
  type: ServiceType;
  nombre: string;
  provider: string;
  neto: number;
  tarifa: number;
  currency: Currency;
  // Días desde la salida del viaje (0 = el día de la salida)
  inicio?: number;
  fin?: number;
  localizador?: string;
  liquidado?: boolean;
}

interface DemoFile {
  destino: string;
  salida: number;
  creado: number;
  pax: number[];
  services: DemoService[];
  alternativa?: { importe: number; moneda: Currency };
  plan?: { concepto: string; importe: number; vence: number }[];
  pagos?: { dia: number; importe: number; moneda?: Currency; tc?: number; medio?: PaymentMethod; nota?: string }[];
  nro?: string;
}

// 10 files: la mayoría sale en 2027; además uno en pocos días, uno en curso y uno finalizado
const FILES: DemoFile[] = [
  {
    destino: "Roma y Florencia", salida: until("2027-04-15"), creado: -30, pax: [0, 1],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-FCO-EZE", provider: "Aerolíneas Argentinas", neto: 2400, tarifa: 2800, currency: "USD", inicio: 0, localizador: "XKJ4PL", liquidado: true },
      { type: "HOTEL", nombre: "Hotel Artemide Roma 4 noches", provider: "Ola", neto: 1100, tarifa: 1400, currency: "USD", inicio: 1, fin: 5 },
      { type: "HOTEL", nombre: "Hotel Brunelleschi Florencia 3 noches", provider: "Ola", neto: 900, tarifa: 1150, currency: "USD", inicio: 5, fin: 8 },
      { type: "TRASLADO", nombre: "Traslado aeropuerto - hotel", provider: "Ola", neto: 120, tarifa: 180, currency: "USD", inicio: 1 },
    ],
    pagos: [{ dia: -29, importe: 2800, nota: "Seña" }],
  },
  {
    destino: "Bariloche", salida: until("2027-01-10"), creado: -45, pax: [2, 3, 4, 5], nro: "Reserva Andes 5521",
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-BRC-AEP (4 pax)", provider: "Aerolíneas Argentinas", neto: 1600000, tarifa: 1850000, currency: "PESOS", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Hotel Huemul 7 noches", provider: "Juliá Tours", neto: 2100000, tarifa: 2500000, currency: "PESOS", inicio: 0, fin: 7, liquidado: true },
      { type: "EXCURSION", nombre: "Circuito Chico + Cerro Campanario", provider: "Juliá Tours", neto: 180000, tarifa: 240000, currency: "PESOS", inicio: 2, liquidado: true },
    ],
    pagos: [
      { dia: -44, importe: 1850000, medio: "TRANSFERENCIA", nota: "Seña Banco Nación" },
      { dia: -10, importe: 2740000, medio: "EFECTIVO", nota: "Saldo" },
    ],
  },
  {
    destino: "Cancún", salida: until("2027-02-14"), creado: -25, pax: [6, 7],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-CUN-EZE", provider: "LATAM", neto: 1700, tarifa: 2000, currency: "USD", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Iberostar Selection 7 noches all inclusive", provider: "Hoteldo", neto: 2600, tarifa: 3100, currency: "USD", inicio: 0, fin: 7 },
      { type: "TRASLADO", nombre: "Traslados in/out", provider: "Hoteldo", neto: 90, tarifa: 140, currency: "USD", inicio: 0 },
    ],
    pagos: [{ dia: -24, importe: 2000, nota: "Seña aéreos" }],
  },
  {
    destino: "Madrid y Barcelona", salida: until("2027-05-20"), creado: -20, pax: [8],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-MAD / BCN-EZE", provider: "Iberia", neto: 1500, tarifa: 1750, currency: "USD", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Hotel Madrid Centro 4 noches", provider: "Europamundo", neto: 700, tarifa: 850, currency: "USD", inicio: 1, fin: 5 },
      { type: "HOTEL", nombre: "Hotel Barcelona Gótico 4 noches", provider: "Europamundo", neto: 750, tarifa: 900, currency: "USD", inicio: 5, fin: 9 },
    ],
    alternativa: { importe: 3600, moneda: "USD" },
    plan: [
      { concepto: "Seña", importe: 1800, vence: -19 },
      { concepto: "Cuota 2", importe: 900, vence: 30 },
      { concepto: "Cuota 3", importe: 900, vence: 120 },
    ],
    pagos: [{ dia: -18, importe: 1800 }],
  },
  {
    destino: "Mendoza", salida: -4, creado: -50, pax: [10, 11],
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-MDZ-AEP", provider: "Flybondi", neto: 420000, tarifa: 500000, currency: "PESOS", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Posada en Chacras de Coria 5 noches", provider: "Juliá Tours", neto: 650000, tarifa: 780000, currency: "PESOS", inicio: 0, fin: 5, liquidado: true },
      { type: "EXCURSION", nombre: "Bodegas de Luján de Cuyo", provider: "Juliá Tours", neto: 90000, tarifa: 120000, currency: "PESOS", inicio: 2, liquidado: true },
    ],
    pagos: [
      { dia: -49, importe: 500000 },
      { dia: -30, importe: 900000, medio: "EFECTIVO" },
    ],
  },
  {
    destino: "París y Londres", salida: until("2027-06-15"), creado: -10, pax: [12],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-CDG / LHR-EZE", provider: "Air France", neto: 1450, tarifa: 1700, currency: "USD", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Hotel Le Marais 5 noches", provider: "Europamundo", neto: 1100, tarifa: 1300, currency: "EURO", inicio: 1, fin: 6 },
      { type: "HOTEL", nombre: "Hotel Covent Garden 4 noches", provider: "Europamundo", neto: 1000, tarifa: 1200, currency: "EURO", inicio: 6, fin: 10 },
    ],
    alternativa: { importe: 4600, moneda: "USD" },
    pagos: [{ dia: -9, importe: 2040000, moneda: "PESOS", tc: 1200, nota: "Pagó la seña en pesos" }],
  },
  {
    destino: "Cataratas del Iguazú", salida: -60, creado: -100, pax: [13],
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-IGR-AEP", provider: "Aerolíneas Argentinas", neto: 300000, tarifa: 360000, currency: "PESOS", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Hotel en Puerto Iguazú 3 noches", provider: "Juliá Tours", neto: 280000, tarifa: 340000, currency: "PESOS", inicio: 0, fin: 3, liquidado: true },
    ],
    pagos: [{ dia: -99, importe: 360000 }, { dia: -90, importe: 340000 }],
  },
  {
    destino: "Punta Cana", salida: 9, creado: -60, pax: [14],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-PUJ-EZE", provider: "Copa", neto: 1300, tarifa: 1550, currency: "USD", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Barceló Bávaro 7 noches all inclusive", provider: "Hoteldo", neto: 1800, tarifa: 2150, currency: "USD", inicio: 0, fin: 7, liquidado: true },
    ],
    pagos: [{ dia: -59, importe: 1550 }, { dia: -30, importe: 2150 }],
  },
  {
    destino: "Salta y Jujuy", salida: until("2027-03-05"), creado: -3, pax: [3, 5, 9],
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-SLA-AEP (3 pax)", provider: "Aerolíneas Argentinas", neto: 900000, tarifa: 1050000, currency: "PESOS", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Hotel Legado Mítico Salta 3 noches", provider: "Juliá Tours", neto: 600000, tarifa: 720000, currency: "PESOS", inicio: 0, fin: 3 },
      { type: "EXCURSION", nombre: "Quebrada de Humahuaca y Salinas Grandes", provider: "Juliá Tours", neto: 210000, tarifa: 270000, currency: "PESOS", inicio: 2 },
    ],
    pagos: [{ dia: -2, importe: 1050000, nota: "Seña" }],
  },
  {
    destino: "Nueva York", salida: until("2027-01-25"), creado: -40, pax: [9],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-JFK-EZE", provider: "American Airlines", neto: 1500, tarifa: 1750, currency: "USD", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Hotel en Midtown 6 noches", provider: "Hoteldo", neto: 1900, tarifa: 2300, currency: "USD", inicio: 0, fin: 6 },
      { type: "EXCURSION", nombre: "Pase de atracciones NY", provider: "Hoteldo", neto: 220, tarifa: 290, currency: "USD", inicio: 2 },
    ],
    pagos: [{ dia: -39, importe: 1750, nota: "Seña" }],
  },
];

const create = async () => {
  if ((await prisma.pax.count({ where: { obs: { startsWith: TAG } } })) > 0) {
    console.log("Ya hay datos de prueba cargados. Para volver a cargarlos, primero: npm run demo-data -- --borrar");
    return;
  }

  const pax: Pax[] = [];
  for (const [i, p] of PAX.entries()) {
    pax.push(
      await prisma.pax.create({
        data: {
          ...p,
          dob: day(-365 * (25 + i * 2)),
          email: `${p.firstname}.${p.lastname}.demo${i}@ejemplo.com`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
          phoneNumber: `291 15${String(4000000 + i * 1371).slice(0, 7)}`,
          adress: "Bahía Blanca",
          obs: `${TAG} Pasajero de prueba`,
        },
      })
    );
  }

  const created: { demo: DemoFile; file: File; services: Service[] }[] = [];
  for (const f of FILES) {
    const services: Service[] = [];
    for (const s of f.services) {
      services.push(
        await prisma.service.create({
          data: {
            type: s.type,
            nombre: s.nombre,
            provider: s.provider,
            precioNeto: String(s.neto),
            tarifa: String(s.tarifa),
            currency: s.currency,
            localizador: s.localizador ?? null,
            fechaInicio: s.inicio !== undefined ? day(f.salida + s.inicio) : null,
            fechaFin: s.fin !== undefined ? day(f.salida + s.fin) : null,
            obs: "",
            liquidado: !!s.liquidado,
            liquidadoAt: s.liquidado ? day(f.creado + 1) : null,
          },
        })
      );
    }

    const createdAt = day(f.creado);
    const anio = yearInArgentina(createdAt);
    const file = await prisma.$transaction(async (tx) =>
      tx.file.create({
        data: {
          numero: await nextFileNumber(tx, anio),
          anio,
          nro: f.nro ?? null,
          obs: `${TAG} File de prueba`,
          destino: f.destino,
          fechaSalida: day(f.salida),
          createdAt,
          precioNetoTotal: "0",
          tarifaTotal: "0",
          tarifaAlternativa: f.alternativa ? String(f.alternativa.importe) : null,
          tarifaAlternativaMoneda: f.alternativa?.moneda ?? null,
          planPersonalizado: !!f.plan,
          clients: { connect: f.pax.map((i) => ({ id: pax[i].id })) },
          services: { connect: services.map((s) => ({ id: s.id })) },
          cuotas: f.plan
            ? { create: f.plan.map((c) => ({ concepto: c.concepto, importe: c.importe, vencimiento: day(c.vence) })) }
            : undefined,
        },
      })
    );

    // Pagos de los pasajeros (en la moneda del file, o en pesos con tipo de cambio)
    const chargeCurrency = f.alternativa?.moneda ?? f.services[0].currency;
    for (const p of f.pagos ?? []) {
      const moneda = p.moneda ?? chargeCurrency;
      const aplicado = moneda === chargeCurrency ? p.importe : moneda === "PESOS" ? p.importe / p.tc! : p.importe * p.tc!;
      await prisma.filePago.create({
        data: {
          fileId: file.id,
          fecha: day(p.dia),
          importe: p.importe,
          moneda,
          tipoCambio: moneda === chargeCurrency ? null : p.tc,
          importeAplicado: Math.round(aplicado * 100) / 100,
          medio: p.medio ?? "TRANSFERENCIA",
          nota: p.nota ?? null,
        },
      });
    }
    created.push({ demo: f, file, services });
  }

  // Pagos a mayoristas, como en la realidad: todos los aéreos (se pagan al emitir) y todo lo de
  // los viajes que ya salieron o salen en menos de 15 días. Un pago por mayorista y moneda,
  // así varios reparten entre servicios de distintos files
  const toPay = new Map<string, { services: Service[]; fecha: number }>();
  for (const { demo, services } of created) {
    for (const service of services) {
      if (service.type !== "AEREO" && demo.salida > 15) continue;
      const key = `${service.provider}|${service.currency}`;
      const group = toPay.get(key) ?? { services: [], fecha: demo.creado + 1 };
      group.services.push(service);
      group.fecha = Math.max(group.fecha, demo.creado + 1);
      toPay.set(key, group);
    }
  }
  for (const [key, group] of toPay) {
    const [mayorista, moneda] = key.split("|");
    await prisma.pagoMayorista.create({
      data: {
        fecha: day(Math.min(group.fecha, 0)),
        mayorista,
        moneda: moneda as Currency,
        importe: group.services.reduce((sum, s) => sum + Number(s.precioNeto), 0),
        medio: "TRANSFERENCIA",
        nota: `${TAG} Pago de prueba`,
        aplicaciones: {
          create: group.services.map((s) => ({ serviceId: s.id, importe: Number(s.precioNeto) })),
        },
      },
    });
  }

  console.log(`✅ Cargados ${pax.length} pasajeros, ${created.length} files y ${toPay.size} pagos a mayoristas de prueba:`);
  for (const { file } of created) {
    console.log(`   ${String(file.numero).padStart(2, "0")}-${file.anio}  ${file.destino.padEnd(22)} sale el ${file.fechaSalida.toLocaleDateString("es-AR")}`);
  }
};

const main = async () => {
  assertLocalDatabase();
  if (process.argv.includes("--borrar")) await remove();
  else await create();
};

main()
  .catch((error) => console.error("Error:", error.message ?? error))
  .finally(() => prisma.$disconnect());
