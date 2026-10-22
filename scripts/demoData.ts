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

const day = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return new Date(d.getTime() + offset * DAY_MS);
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
  { firstname: "Mateo", lastname: "Martínez", dni: "33555222", passport: "AAJ555222", passportVto: day(10), dniVto: day(1700) }, // vence antes del viaje a NY
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

// 10 files: salen hoy, en pocos días, en curso y finalizados; distintas monedas y estados de pago
const FILES: DemoFile[] = [
  {
    destino: "Roma y Florencia", salida: 5, creado: -70, pax: [0, 1],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-FCO-EZE", provider: "Aerolíneas Argentinas", neto: 2400, tarifa: 2800, currency: "USD", inicio: 5, localizador: "XKJ4PL", liquidado: true },
      { type: "HOTEL", nombre: "Hotel Artemide Roma 4 noches", provider: "Ola", neto: 1100, tarifa: 1400, currency: "USD", inicio: 6, fin: 10 },
      { type: "HOTEL", nombre: "Hotel Brunelleschi Florencia 3 noches", provider: "Ola", neto: 900, tarifa: 1150, currency: "USD", inicio: 10, fin: 13 },
      { type: "TRASLADO", nombre: "Traslado aeropuerto - hotel", provider: "Ola", neto: 120, tarifa: 180, currency: "USD", inicio: 6 },
    ],
    pagos: [
      { dia: -68, importe: 2800, nota: "Seña" },
      { dia: -20, importe: 1500, nota: "Parte del saldo" },
    ],
  },
  {
    destino: "Bariloche", salida: 12, creado: -45, pax: [2, 3, 4, 5], nro: "Reserva Andes 5521",
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-BRC-AEP (4 pax)", provider: "Aerolíneas Argentinas", neto: 1600000, tarifa: 1850000, currency: "PESOS", inicio: 12, liquidado: true },
      { type: "HOTEL", nombre: "Hotel Huemul 7 noches", provider: "Juliá Tours", neto: 2100000, tarifa: 2500000, currency: "PESOS", inicio: 12, fin: 19, liquidado: true },
      { type: "EXCURSION", nombre: "Circuito Chico + Cerro Campanario", provider: "Juliá Tours", neto: 180000, tarifa: 240000, currency: "PESOS", inicio: 14, liquidado: true },
    ],
    pagos: [
      { dia: -44, importe: 1850000, medio: "TRANSFERENCIA", nota: "Seña Banco Nación" },
      { dia: -15, importe: 2740000, medio: "EFECTIVO", nota: "Saldo" },
    ],
  },
  {
    destino: "Cancún", salida: 28, creado: -35, pax: [6, 7],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-CUN-EZE", provider: "LATAM", neto: 1700, tarifa: 2000, currency: "USD", inicio: 28, liquidado: true },
      { type: "HOTEL", nombre: "Iberostar Selection 7 noches all inclusive", provider: "Hoteldo", neto: 2600, tarifa: 3100, currency: "USD", inicio: 28, fin: 35 },
      { type: "TRASLADO", nombre: "Traslados in/out", provider: "Hoteldo", neto: 90, tarifa: 140, currency: "USD", inicio: 28 },
    ],
    pagos: [{ dia: -34, importe: 2000, nota: "Seña aéreos" }],
  },
  {
    destino: "Madrid y Barcelona", salida: 60, creado: -20, pax: [8],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-MAD / BCN-EZE", provider: "Iberia", neto: 1500, tarifa: 1750, currency: "USD", inicio: 60, liquidado: true },
      { type: "HOTEL", nombre: "Hotel Madrid Centro 4 noches", provider: "Europamundo", neto: 700, tarifa: 850, currency: "USD", inicio: 60, fin: 64 },
      { type: "HOTEL", nombre: "Hotel Barcelona Gótico 4 noches", provider: "Europamundo", neto: 750, tarifa: 900, currency: "USD", inicio: 64, fin: 68 },
    ],
    alternativa: { importe: 3600, moneda: "USD" },
    plan: [
      { concepto: "Seña", importe: 1800, vence: -19 },
      { concepto: "Cuota 2", importe: 900, vence: 10 },
      { concepto: "Cuota 3", importe: 900, vence: 35 },
    ],
    pagos: [{ dia: -18, importe: 1800 }],
  },
  {
    destino: "Mendoza", salida: -4, creado: -50, pax: [10, 11],
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-MDZ-AEP", provider: "Flybondi", neto: 420000, tarifa: 500000, currency: "PESOS", inicio: -4, liquidado: true },
      { type: "HOTEL", nombre: "Posada en Chacras de Coria 5 noches", provider: "Juliá Tours", neto: 650000, tarifa: 780000, currency: "PESOS", inicio: -4, fin: 1, liquidado: true },
      { type: "EXCURSION", nombre: "Bodegas de Luján de Cuyo", provider: "Juliá Tours", neto: 90000, tarifa: 120000, currency: "PESOS", inicio: -2, liquidado: true },
    ],
    pagos: [
      { dia: -49, importe: 500000 },
      { dia: -30, importe: 900000, medio: "EFECTIVO" },
    ],
  },
  {
    destino: "París y Londres", salida: 120, creado: -10, pax: [12],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-CDG / LHR-EZE", provider: "Air France", neto: 1450, tarifa: 1700, currency: "USD", inicio: 120 },
      { type: "HOTEL", nombre: "Hotel Le Marais 5 noches", provider: "Europamundo", neto: 1100, tarifa: 1300, currency: "EURO", inicio: 120, fin: 125 },
      { type: "HOTEL", nombre: "Hotel Covent Garden 4 noches", provider: "Europamundo", neto: 1000, tarifa: 1200, currency: "EURO", inicio: 125, fin: 129 },
    ],
    alternativa: { importe: 4600, moneda: "USD" },
    pagos: [{ dia: -9, importe: 2040000, moneda: "PESOS", tc: 1200, nota: "Pagó en pesos" }],
  },
  {
    destino: "Cataratas del Iguazú", salida: -60, creado: -100, pax: [13],
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-IGR-AEP", provider: "Aerolíneas Argentinas", neto: 300000, tarifa: 360000, currency: "PESOS", inicio: -60, liquidado: true },
      { type: "HOTEL", nombre: "Hotel en Puerto Iguazú 3 noches", provider: "Juliá Tours", neto: 280000, tarifa: 340000, currency: "PESOS", inicio: -60, fin: -57, liquidado: true },
    ],
    pagos: [{ dia: -99, importe: 360000 }, { dia: -90, importe: 340000 }],
  },
  {
    destino: "Punta Cana", salida: 0, creado: -60, pax: [14],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-PUJ-EZE", provider: "Copa", neto: 1300, tarifa: 1550, currency: "USD", inicio: 0, liquidado: true },
      { type: "HOTEL", nombre: "Barceló Bávaro 7 noches all inclusive", provider: "Hoteldo", neto: 1800, tarifa: 2150, currency: "USD", inicio: 0, fin: 7, liquidado: true },
    ],
    pagos: [{ dia: -59, importe: 1550 }, { dia: -30, importe: 2150 }],
  },
  {
    destino: "Salta y Jujuy", salida: 45, creado: -1, pax: [3, 5, 9],
    services: [
      { type: "AEREO", nombre: "Aéreo AEP-SLA-AEP (3 pax)", provider: "Aerolíneas Argentinas", neto: 900000, tarifa: 1050000, currency: "PESOS", inicio: 45 },
      { type: "HOTEL", nombre: "Hotel Legado Mítico Salta 3 noches", provider: "Juliá Tours", neto: 600000, tarifa: 720000, currency: "PESOS", inicio: 45, fin: 48 },
      { type: "EXCURSION", nombre: "Quebrada de Humahuaca y Salinas Grandes", provider: "Juliá Tours", neto: 210000, tarifa: 270000, currency: "PESOS", inicio: 47 },
    ],
  },
  {
    destino: "Nueva York", salida: 18, creado: -40, pax: [9],
    services: [
      { type: "AEREO", nombre: "Aéreo EZE-JFK-EZE", provider: "American Airlines", neto: 1500, tarifa: 1750, currency: "USD", inicio: 18 },
      { type: "HOTEL", nombre: "Hotel en Midtown 6 noches", provider: "Hoteldo", neto: 1900, tarifa: 2300, currency: "USD", inicio: 18, fin: 24 },
      { type: "EXCURSION", nombre: "Pase de atracciones NY", provider: "Hoteldo", neto: 220, tarifa: 290, currency: "USD", inicio: 20 },
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

  const created: { file: File; services: Service[] }[] = [];
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
            fechaInicio: s.inicio !== undefined ? day(s.inicio) : null,
            fechaFin: s.fin !== undefined ? day(s.fin) : null,
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
    created.push({ file, services });
  }

  // Pagos a mayoristas: uno repartido entre dos files (aéreos) y uno de hoteles
  const svc = (fileIndex: number, serviceIndex: number) => created[fileIndex].services[serviceIndex];
  await prisma.pagoMayorista.create({
    data: {
      fecha: day(-60),
      mayorista: "Aerolíneas Argentinas",
      importe: 2400 + 1300,
      moneda: "USD",
      medio: "TRANSFERENCIA",
      nota: `${TAG} Aéreos Roma y Punta Cana`,
      aplicaciones: {
        create: [
          { serviceId: svc(0, 0).id, importe: 2400 },
          { serviceId: svc(7, 0).id, importe: 1300 },
        ],
      },
    },
  });
  await prisma.pagoMayorista.create({
    data: {
      fecha: day(-25),
      mayorista: "Hoteldo",
      importe: 1800 + 1300,
      moneda: "USD",
      medio: "TRANSFERENCIA",
      nota: `${TAG} Hotel Punta Cana + parte Cancún`,
      aplicaciones: {
        create: [
          { serviceId: svc(7, 1).id, importe: 1800 },
          { serviceId: svc(2, 1).id, importe: 1300 },
        ],
      },
    },
  });

  console.log(`✅ Cargados ${pax.length} pasajeros y ${created.length} files de prueba:`);
  for (const { file } of created) {
    console.log(`   ${String(file.numero).padStart(2, "0")}-${file.anio}  ${file.destino}`);
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
