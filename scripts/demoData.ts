// Loads example data to try the system: npm run demo-data
// Only the past trips (if the rest is already loaded): npm run demo-data -- --historial
// Only the group departure (if the rest is already loaded): npm run demo-data -- --grupal
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
  // Group departures (their reservations were deleted just above)
  await prisma.grupo.deleteMany({ where: { obs: { startsWith: TAG } } });
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

// Historial: viajes de este año que ya salieron, pagados al 100% por el pasajero y a los
// mayoristas (aéreos al emitir, el resto 1 mes antes). Casi todos facturados cuando el
// pasajero terminó de pagar; algunos sin facturar para ver el aviso "falta facturar"
interface HistoryFile {
  destino: string;
  creado: string;
  salida: string;
  pax: number[];
  moneda: Currency;
  services: { type: ServiceType; nombre: string; provider: string; neto: number; tarifa: number }[];
  facturado: boolean;
}

const HISTORY: HistoryFile[] = [
  { destino: "Florianópolis", creado: "2026-01-05", salida: "2026-02-10", pax: [0, 1], moneda: "PESOS", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo AEP-FLN-AEP", provider: "Aerolíneas Argentinas", neto: 900000, tarifa: 1050000 },
    { type: "HOTEL", nombre: "Posada en Jurerê 7 noches", provider: "Juliá Tours", neto: 1200000, tarifa: 1450000 },
  ] },
  { destino: "Miami", creado: "2026-01-20", salida: "2026-03-15", pax: [10, 11], moneda: "USD", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo EZE-MIA-EZE", provider: "American Airlines", neto: 1400, tarifa: 1650 },
    { type: "HOTEL", nombre: "Hotel en Brickell 6 noches", provider: "Hoteldo", neto: 1800, tarifa: 2200 },
  ] },
  { destino: "Río de Janeiro", creado: "2026-02-10", salida: "2026-04-05", pax: [12], moneda: "USD", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo EZE-GIG-EZE", provider: "LATAM", neto: 1100, tarifa: 1300 },
    { type: "HOTEL", nombre: "Hotel en Copacabana 6 noches", provider: "Ola", neto: 1300, tarifa: 1600 },
    { type: "EXCURSION", nombre: "Cristo Redentor y Pan de Azúcar", provider: "Ola", neto: 150, tarifa: 220 },
  ] },
  { destino: "Ushuaia", creado: "2026-03-01", salida: "2026-04-20", pax: [2, 3], moneda: "PESOS", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo AEP-USH-AEP", provider: "Aerolíneas Argentinas", neto: 1100000, tarifa: 1300000 },
    { type: "HOTEL", nombre: "Hotel Los Acebos 4 noches", provider: "Juliá Tours", neto: 900000, tarifa: 1100000 },
    { type: "EXCURSION", nombre: "Navegación Canal Beagle", provider: "Juliá Tours", neto: 200000, tarifa: 260000 },
  ] },
  { destino: "Lisboa y Oporto", creado: "2026-03-15", salida: "2026-05-25", pax: [13], moneda: "USD", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo EZE-LIS-EZE", provider: "TAP", neto: 1600, tarifa: 1900 },
    { type: "HOTEL", nombre: "Hoteles Lisboa y Oporto 8 noches", provider: "Europamundo", neto: 1400, tarifa: 1700 },
  ] },
  { destino: "Puerto Madryn", creado: "2026-04-10", salida: "2026-06-01", pax: [4, 5], moneda: "PESOS", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo AEP-PMY-AEP", provider: "Aerolíneas Argentinas", neto: 700000, tarifa: 820000 },
    { type: "HOTEL", nombre: "Hotel frente al mar 4 noches", provider: "Juliá Tours", neto: 600000, tarifa: 750000 },
    { type: "EXCURSION", nombre: "Avistaje de ballenas", provider: "Juliá Tours", neto: 150000, tarifa: 190000 },
  ] },
  { destino: "Aruba", creado: "2026-04-25", salida: "2026-07-10", pax: [6, 7], moneda: "USD", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo EZE-AUA-EZE", provider: "Copa", neto: 1500, tarifa: 1750 },
    { type: "HOTEL", nombre: "Riu Palace Aruba 7 noches all inclusive", provider: "Hoteldo", neto: 2400, tarifa: 2900 },
  ] },
  { destino: "Cusco y Machu Picchu", creado: "2026-05-15", salida: "2026-07-25", pax: [8], moneda: "USD", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo EZE-LIM-CUZ-EZE", provider: "LATAM", neto: 900, tarifa: 1100 },
    { type: "HOTEL", nombre: "Hoteles Cusco y Valle Sagrado 6 noches", provider: "Ola", neto: 700, tarifa: 900 },
    { type: "EXCURSION", nombre: "Tren y entrada a Machu Picchu", provider: "Ola", neto: 500, tarifa: 650 },
  ] },
  { destino: "Córdoba", creado: "2026-06-05", salida: "2026-07-15", pax: [14], moneda: "PESOS", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo AEP-COR-AEP", provider: "Flybondi", neto: 500000, tarifa: 600000 },
    { type: "HOTEL", nombre: "Hotel en Villa General Belgrano 5 noches", provider: "Juliá Tours", neto: 700000, tarifa: 850000 },
  ] },
  { destino: "Orlando", creado: "2026-06-20", salida: "2026-08-20", pax: [2, 3, 4, 5], moneda: "USD", facturado: false, services: [
    { type: "AEREO", nombre: "Aéreo EZE-MCO-EZE (4 pax)", provider: "Copa", neto: 1700, tarifa: 2000 },
    { type: "HOTEL", nombre: "Hotel cerca de Disney 8 noches", provider: "Hoteldo", neto: 2100, tarifa: 2600 },
    { type: "EXCURSION", nombre: "Entradas a los parques", provider: "Hoteldo", neto: 900, tarifa: 1100 },
  ] },
  { destino: "El Calafate", creado: "2026-07-10", salida: "2026-09-05", pax: [0], moneda: "PESOS", facturado: false, services: [
    { type: "AEREO", nombre: "Aéreo AEP-FTE-AEP", provider: "Aerolíneas Argentinas", neto: 1200000, tarifa: 1400000 },
    { type: "HOTEL", nombre: "Hotel Xelena 4 noches", provider: "Juliá Tours", neto: 1000000, tarifa: 1250000 },
  ] },
  { destino: "Punta del Este", creado: "2026-08-01", salida: "2026-09-20", pax: [10], moneda: "USD", facturado: true, services: [
    { type: "AEREO", nombre: "Aéreo AEP-PDP-AEP", provider: "Aerolíneas Argentinas", neto: 600, tarifa: 720 },
    { type: "HOTEL", nombre: "Hotel en La Barra 5 noches", provider: "Ola", neto: 1500, tarifa: 1850 },
  ] },
  { destino: "Santiago de Chile", creado: "2026-08-20", salida: "2026-10-10", pax: [12], moneda: "USD", facturado: false, services: [
    { type: "AEREO", nombre: "Aéreo EZE-SCL-EZE", provider: "LATAM", neto: 500, tarifa: 600 },
    { type: "HOTEL", nombre: "Hotel en Providencia 4 noches", provider: "Ola", neto: 800, tarifa: 1000 },
  ] },
];

// Fecha de calendario al mediodía, corrida "days" días
const dateOf = (isoDate: string, days = 0) => new Date(new Date(`${isoDate}T12:00:00`).getTime() + days * DAY_MS);

const createHistory = async (pax: Pax[]) => {
  for (const [index, h] of HISTORY.entries()) {
    const services: Service[] = [];
    for (const s of h.services) {
      services.push(
        await prisma.service.create({
          data: {
            type: s.type,
            nombre: s.nombre,
            provider: s.provider,
            precioNeto: String(s.neto),
            tarifa: String(s.tarifa),
            currency: h.moneda,
            fechaInicio: dateOf(h.salida),
            obs: "",
            createdAt: dateOf(h.creado),
            liquidado: s.type !== "AEREO",
            liquidadoAt: s.type !== "AEREO" ? dateOf(h.salida, -30) : null,
          },
        })
      );
    }

    const total = h.services.reduce((sum, s) => sum + s.tarifa, 0);
    const sena = h.services.filter((s) => s.type === "AEREO").reduce((sum, s) => sum + s.tarifa, 0);
    const payer = pax[h.pax[0]].id;
    const createdAt = dateOf(h.creado);
    const anio = yearInArgentina(createdAt);
    const file = await prisma.$transaction(async (tx) =>
      tx.file.create({
        data: {
          numero: await nextFileNumber(tx, anio),
          anio,
          obs: `${TAG} Viaje de prueba ya realizado`,
          destino: h.destino,
          fechaSalida: dateOf(h.salida),
          createdAt,
          precioNetoTotal: "0",
          tarifaTotal: "0",
          clients: { connect: h.pax.map((i) => ({ id: pax[i].id })) },
          services: { connect: services.map((s) => ({ id: s.id })) },
          // Facturado entero cuando el pasajero terminó de pagar
          ...(h.facturado && {
            facturadoAt: dateOf(h.salida, -24),
            facturaImporte: total,
            facturaMoneda: h.moneda,
            facturaNumero: `B-0001-${String(1000 + index).padStart(8, "0")}`,
          }),
        },
      })
    );

    // Pagado al 100%: la seña (aéreos) al reservar y el saldo 25 días antes de salir
    for (const pago of [
      { fecha: dateOf(h.creado, 1), importe: sena, medio: "TRANSFERENCIA" as const, nota: "Seña" },
      { fecha: dateOf(h.salida, -25), importe: total - sena, medio: "EFECTIVO" as const, nota: "Saldo" },
    ]) {
      await prisma.filePago.create({
        data: { ...pago, fileId: file.id, moneda: h.moneda, importeAplicado: pago.importe, pagadorId: payer, recibo: { create: {} } },
      });
    }

    // Pagos a los mayoristas: aéreos al emitir (al día siguiente de reservar), el resto 1 mes antes
    for (const s of services) {
      await prisma.pagoMayorista.create({
        data: {
          fecha: s.type === "AEREO" ? dateOf(h.creado, 1) : dateOf(h.salida, -30),
          mayorista: s.provider,
          moneda: h.moneda,
          importe: Number(s.precioNeto),
          medio: "TRANSFERENCIA",
          nota: `${TAG} Pago de prueba`,
          aplicaciones: { create: [{ serviceId: s.id, importe: Number(s.precioNeto) }] },
        },
      });
    }
    console.log(
      `   ${String(file.numero).padStart(2, "0")}-${file.anio}  ${h.destino.padEnd(22)} viajó el ${file.fechaSalida.toLocaleDateString("es-AR")}  ${h.facturado ? "facturado" : "SIN FACTURAR"}`
    );
  }
};

// Solo el historial, cuando lo demás ya está cargado
const addHistory = async () => {
  const pax = await prisma.pax.findMany({ where: { obs: { startsWith: TAG } }, orderBy: { createdAt: "asc" } });
  // En el mismo orden en que se crearon (el email tiene el número: ...demo3@ejemplo.com)
  const order = (p: Pax) => Number(p.email?.match(/demo(\d+)@/)?.[1] ?? 0);
  pax.sort((a, b) => order(a) - order(b));
  if (pax.length < PAX.length) {
    console.log("Primero cargá los datos de prueba: npm run demo-data");
    return;
  }
  if ((await prisma.file.count({ where: { obs: `${TAG} Viaje de prueba ya realizado` } })) > 0) {
    console.log("El historial ya está cargado. Para volver a cargarlo, primero: npm run demo-data -- --borrar");
    return;
  }
  console.log(`✅ Historial: ${HISTORY.length} viajes ya realizados y pagados:`);
  await createHistory(pax);
  await createGroupDemo(pax);
};

// Salida grupal de ejemplo: servicios en dólares y un traslado en pesos, dos planes de pago,
// reservas con precio de preventa y de lista, pagos y parte del rooming armado
const GROUP_SERVICES: { type: ServiceType; nombre: string; provider: string; currency: Currency; neto: number; lista: number; preventa: number }[] = [
  { type: "AEREO", nombre: "Aéreo EZE-MAD / FCO-EZE", provider: "Iberia", currency: "USD", neto: 1200, lista: 1450, preventa: 1350 },
  { type: "HOTEL", nombre: "Hoteles 4* con desayuno (14 noches)", provider: "Europamundo", currency: "USD", neto: 1800, lista: 2300, preventa: 2100 },
  { type: "EXCURSION", nombre: "Excursiones y guía en español", provider: "Europamundo", currency: "USD", neto: 300, lista: 400, preventa: 380 },
  { type: "TRASLADO", nombre: "Traslado Bahía Blanca - Ezeiza", provider: "Transporte Patagónico", currency: "PESOS", neto: 60000, lista: 90000, preventa: 90000 },
];

const GROUP_RESERVATIONS: {
  nombre: string;
  pax: number[];
  plan: "Preventa" | "Normal";
  preventa: boolean;
  pagos: { fecha: string; importe: number; moneda: Currency; aplicada: Currency; tc?: number; nota: string }[];
  habitacion?: "DOBLE" | "CUADRUPLE";
}[] = [
  {
    nombre: "Gómez x2", pax: [0, 1], plan: "Preventa", preventa: true, habitacion: "DOBLE",
    pagos: [
      { fecha: "2026-09-28", importe: 2298, moneda: "USD", aplicada: "USD", nota: "Seña preventa" },
      { fecha: "2026-09-28", importe: 180000, moneda: "PESOS", aplicada: "PESOS", nota: "Traslado" },
    ],
  },
  {
    nombre: "Fernández x4", pax: [2, 3, 4, 5], plan: "Normal", preventa: false, habitacion: "CUADRUPLE",
    pagos: [{ fecha: "2026-10-10", importe: 3000000, moneda: "PESOS", aplicada: "USD", tc: 1200, nota: "Seña en pesos" }],
  },
  { nombre: "Rodríguez x2", pax: [6, 7], plan: "Normal", preventa: false, habitacion: "DOBLE", pagos: [] },
  {
    nombre: "Sánchez x2", pax: [10, 11], plan: "Preventa", preventa: true,
    pagos: [{ fecha: "2026-09-30", importe: 2298, moneda: "USD", aplicada: "USD", nota: "Seña preventa" }],
  },
  { nombre: "López x1", pax: [8], plan: "Normal", preventa: false, pagos: [] },
];

const createGroupDemo = async (pax: Pax[]) => {
  const titulo = "Europa Septiembre 2027";
  const grupo = await prisma.grupo.create({
    data: {
      titulo,
      destino: "Madrid, París y Roma",
      fechaSalida: dateOf("2027-09-05"),
      fechaRegreso: dateOf("2027-09-20"),
      cupo: 20,
      obs: `${TAG} Salida grupal de prueba`,
      servicios: {
        create: GROUP_SERVICES.map((s) => ({
          type: s.type,
          nombre: s.nombre,
          provider: s.provider,
          currency: s.currency,
          netoPorPax: s.neto,
          tarifaPorPax: s.lista,
          fechaInicio: dateOf("2027-09-05"),
        })),
      },
      planes: {
        create: [
          {
            nombre: "Preventa",
            cuotas: [
              { concepto: "Seña", porcentaje: 30, vencimiento: dateOf("2026-10-01").toISOString() },
              { concepto: "Segunda cuota", porcentaje: 30, vencimiento: dateOf("2027-02-01").toISOString() },
              { concepto: "Saldo", porcentaje: null, vencimiento: dateOf("2027-07-15").toISOString() },
            ],
          },
          {
            nombre: "Normal",
            cuotas: [
              { concepto: "Seña", porcentaje: 40, vencimiento: dateOf("2026-10-15").toISOString() },
              { concepto: "Saldo", porcentaje: null, vencimiento: dateOf("2027-07-15").toISOString() },
            ],
          },
        ],
      },
    },
    include: { servicios: true, planes: true },
  });

  for (const r of GROUP_RESERVATIONS) {
    const n = r.pax.length;
    const file = await prisma.file.create({
      data: {
        destino: `${titulo} · ${r.nombre}`,
        fechaSalida: grupo.fechaSalida,
        precioNetoTotal: "0",
        tarifaTotal: "0",
        obs: `${TAG} Reserva de prueba`,
        grupoId: grupo.id,
        reservaNombre: r.nombre,
        grupoPlanId: grupo.planes.find((p) => p.nombre === r.plan)!.id,
        clients: { connect: r.pax.map((i) => ({ id: pax[i].id })) },
        services: {
          create: grupo.servicios.map((s) => {
            const def = GROUP_SERVICES.find((d) => d.nombre === s.nombre)!;
            return {
              type: s.type,
              nombre: s.nombre,
              provider: s.provider,
              currency: s.currency,
              precioNeto: String(def.neto * n),
              tarifa: String((r.preventa ? def.preventa : def.lista) * n),
              fechaInicio: s.fechaInicio,
              obs: "",
              grupoServicioId: s.id,
            };
          }),
        },
      },
    });
    for (const p of r.pagos) {
      const aplicado = p.moneda === p.aplicada ? p.importe : Math.round((p.importe / p.tc!) * 100) / 100;
      await prisma.filePago.create({
        data: {
          fileId: file.id,
          fecha: dateOf(p.fecha),
          importe: p.importe,
          moneda: p.moneda,
          tipoCambio: p.moneda === p.aplicada ? null : p.tc,
          importeAplicado: aplicado,
          monedaAplicada: p.aplicada,
          medio: "TRANSFERENCIA",
          nota: p.nota,
          pagadorId: pax[r.pax[0]].id,
          recibo: { create: {} },
        },
      });
    }
    if (r.habitacion) {
      await prisma.grupoHabitacion.create({
        data: { grupoId: grupo.id, tipo: r.habitacion, pasajeros: { connect: r.pax.map((i) => ({ id: pax[i].id })) } },
      });
    }
  }
  console.log(`✅ Salida grupal "${titulo}": ${GROUP_RESERVATIONS.length} reservas, 2 planes de pago y parte del rooming`);
};

// Solo la salida grupal, cuando lo demás ya está cargado
const addGroupDemo = async () => {
  const pax = await prisma.pax.findMany({ where: { obs: { startsWith: TAG } }, orderBy: { createdAt: "asc" } });
  const order = (p: Pax) => Number(p.email?.match(/demo(\d+)@/)?.[1] ?? 0);
  pax.sort((a, b) => order(a) - order(b));
  if (pax.length < PAX.length) {
    console.log("Primero cargá los datos de prueba: npm run demo-data");
    return;
  }
  if ((await prisma.grupo.count({ where: { obs: { startsWith: TAG } } })) > 0) {
    console.log("La salida grupal de prueba ya está cargada. Para volver a cargarla, primero: npm run demo-data -- --borrar");
    return;
  }
  await createGroupDemo(pax);
};

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
  console.log(`✅ Historial: ${HISTORY.length} viajes ya realizados y pagados:`);
  await createHistory(pax);
};

const main = async () => {
  assertLocalDatabase();
  if (process.argv.includes("--borrar")) await remove();
  else if (process.argv.includes("--historial")) await addHistory();
  else if (process.argv.includes("--grupal")) await addGroupDemo();
  else await create();
};

main()
  .catch((error) => console.error("Error:", error.message ?? error))
  .finally(() => prisma.$disconnect());
