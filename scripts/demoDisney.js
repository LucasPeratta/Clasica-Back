// Example group "Disney Febrero 2027", created through the API (like the screens do):
// npm run demo-disney (with the server running: npm run dev). Only on a local database.
// Demo data: removable with npm run demo-data -- --borrar
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const TAG = "[DEMO]";
const API = `http://localhost:${process.env.PORT || 3000}/api`;

const url = new URL(process.env.DB_CONNECTION_STRING);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Solo en la base local");

const iso = (day) => `${day}T12:00:00.000Z`;
let headers;
const call = async (method, path, body) => {
  const res = await fetch(API + path, { method, headers: { ...headers, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data?.msg}`);
  return data;
};

// [reservation, room, members: firstname, lastname, birth date, has US visa]
const FAMILIES = [
  ["Pérez x4", "CUADRUPLE", [["Diego", "Pérez", "1984-03-12", 1], ["Carolina", "Pérez", "1986-07-02", 1], ["Tomás", "Pérez", "2015-05-20", 1], ["Lola", "Pérez", "2018-11-09", 1]]],
  ["Martínez x4", "CUADRUPLE", [["Javier", "Martínez", "1980-01-25", 1], ["Paula", "Martínez", "1982-09-14", 1], ["Benicio", "Martínez", "2013-02-03", 1], ["Emma", "Martínez", "2016-06-30", 1]]],
  ["Romero x4", "CUADRUPLE", [["Gustavo", "Romero", "1978-04-18", 1], ["Silvina", "Romero", "1981-12-01", 1], ["Felipe", "Romero", "2012-08-22", 0], ["Mía", "Romero", "2014-03-15", 0]]],
  ["Álvarez x4", "CUADRUPLE", [["Martín", "Álvarez", "1985-10-10", 1], ["Natalia", "Álvarez", "1987-05-05", 1], ["Bautista", "Álvarez", "2017-01-19", 1], ["Olivia", "Álvarez", "2019-09-27", 1]]],
  ["Torres x3", "TRIPLE", [["Pablo", "Torres", "1983-06-08", 1], ["Laura", "Torres", "1984-02-11", 1], ["Joaquín", "Torres", "2014-10-04", 1]]],
  ["Ruiz x3", "TRIPLE", [["Hernán", "Ruiz", "1979-11-29", 1], ["Mariana", "Ruiz", "1980-03-03", 1], ["Delfina", "Ruiz", "2011-07-16", 1]]],
  ["Molina x3", "TRIPLE", [["Sebastián", "Molina", "1988-08-08", 1], ["Florencia", "Molina", "1989-04-21", 1], ["Lucio", "Molina", "2020-12-12", 1]]],
  ["Castro x2", "DOBLE", [["Ricardo", "Castro", "1965-05-17", 1], ["Graciela", "Castro", "1967-01-30", 1]]],
  // Two people who don't know each other: one reservation each, sharing a double room
  ["Herrera x1", "DOBLE", [["Patricia", "Herrera", "1972-09-09", 1]]],
  ["Vega x1", "DOBLE", [["Mónica", "Vega", "1975-02-22", 2]]],
];

const main = async () => {
  if (await prisma.grupo.findFirst({ where: { titulo: "Disney Febrero 2027" } })) {
    console.log("El ejemplo de Disney ya está cargado. Para volver a cargarlo, primero: npm run demo-data -- --borrar");
    return;
  }
  const user = await prisma.user.findFirst();
  headers = { Authorization: "Bearer " + jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "10m" }) };

  const titulo = "Disney Febrero 2027";
  const { id: grupoId } = await call("POST", "/grupos", {
    titulo,
    destino: "Orlando y Miami",
    fechaSalida: iso("2027-02-17"),
    fechaRegreso: iso("2027-03-02"),
    cupo: 30,
    visaUsa: true,
    obs: `${TAG} Salida grupal de ejemplo (precios inventados)`,
  });

  // Itinerary (example prices in dollars)
  const svc = (data) => call("POST", `/grupos/${grupoId}/servicios`, { currency: "USD", ...data });
  await svc({ type: "AEREO", nombre: "Aéreo Bahía Blanca - Orlando / Miami - Bahía Blanca", provider: "American Airlines", netoPorPax: 1300, tarifaPorPax: 1550, fechaInicio: iso("2027-02-17"), fechaFin: iso("2027-03-02") });
  await svc({ type: "TRASLADO", nombre: "Alquiler de auto (minivan) 18 al 27/02", provider: "Alamo Rent a Car", modoPrecio: "POR_RESERVA", netoPorPax: 600, tarifaPorPax: 750, fechaInicio: iso("2027-02-18"), fechaFin: iso("2027-02-27") });
  await svc({
    type: "HOTEL", nombre: "Hotel en Orlando (9 noches)", provider: "Hoteldo", modoPrecio: "POR_HABITACION", netoPorPax: 0, tarifaPorPax: 0,
    preciosHabitacion: { DOBLE: { neto: 1150, tarifa: 1400 }, TRIPLE: { neto: 900, tarifa: 1100 }, CUADRUPLE: { neto: 750, tarifa: 920 } },
    fechaInicio: iso("2027-02-18"), fechaFin: iso("2027-02-27"),
  });
  await svc({
    type: "HOTEL", nombre: "Hotel en Miami (3 noches)", provider: "Hoteldo", modoPrecio: "POR_HABITACION", netoPorPax: 0, tarifaPorPax: 0,
    preciosHabitacion: { DOBLE: { neto: 600, tarifa: 720 }, TRIPLE: { neto: 450, tarifa: 560 }, CUADRUPLE: { neto: 380, tarifa: 470 } },
    fechaInicio: iso("2027-02-27"), fechaFin: iso("2027-03-02"),
  });
  await svc({ type: "EXCURSION", nombre: "Disney: 4 días de parques", provider: "Disney Destinations", netoPorPax: 520, tarifaPorPax: 600, edadMenor: 10, netoMenor: 480, tarifaMenor: 560, fechaInicio: iso("2027-02-19"), fechaFin: iso("2027-02-22") });
  await svc({ type: "EXCURSION", nombre: "Universal: 4 días de parques", provider: "Universal Orlando", netoPorPax: 480, tarifaPorPax: 560, edadMenor: 10, netoMenor: 450, tarifaMenor: 520, fechaInicio: iso("2027-02-23"), fechaFin: iso("2027-02-26") });

  const plan = async (nombre, cuotas) => (await call("POST", `/grupos/${grupoId}/planes`, { nombre, cuotas })).id;
  const preventa = await plan("Preventa", [
    { concepto: "Seña", porcentaje: 30, vencimiento: iso("2026-10-31") },
    { concepto: "Segunda cuota", porcentaje: 30, vencimiento: iso("2026-12-15") },
    { concepto: "Saldo", porcentaje: null, vencimiento: iso("2027-01-15") },
  ]);
  const normal = await plan("Normal", [
    { concepto: "Seña", porcentaje: 40, vencimiento: iso("2026-11-15") },
    { concepto: "Saldo", porcentaje: null, vencimiento: iso("2027-01-15") },
  ]);

  let seq = 0;
  const shared = [];
  for (const [index, [nombre, room, members]] of FAMILIES.entries()) {
    const pax = [];
    for (const [firstname, lastname, dob, visa] of members) {
      seq += 1;
      pax.push(
        await prisma.pax.create({
          data: {
            firstname,
            lastname,
            dni: String(30500000 + seq * 7919),
            dniVto: new Date("2031-06-30T12:00:00"),
            passport: `AAN${String(100000 + seq * 37).slice(0, 6)}`,
            // Gustavo Romero: passport expiring less than 6 months after the trip
            passportVto: new Date(seq === 9 ? "2027-05-10T12:00:00" : "2030-03-31T12:00:00"),
            // visa 1 = valid, 2 = expires before coming back, 0 = not loaded
            visaUsa: visa ? `B${String(4000000 + seq * 991)}` : null,
            visaUsaVto: visa === 1 ? new Date("2033-08-31T12:00:00") : visa === 2 ? new Date("2027-02-25T12:00:00") : null,
            dob: new Date(`${dob}T12:00:00`),
            email: `${firstname}.${lastname}.disney${seq}@ejemplo.com`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
            phoneNumber: `291 15${String(5000000 + seq * 1733).slice(0, 7)}`,
            adress: "Bahía Blanca",
            obs: `${TAG} Pasajero de ejemplo Disney`,
          },
        })
      );
    }
    const enPreventa = index <= 2 || nombre === "Castro x2";
    const { id: fileId } = await call("POST", `/grupos/${grupoId}/reservas`, {
      nombre,
      paxIds: pax.map((p) => p.id),
      planId: enPreventa ? preventa : normal,
      habitacionTipo: room,
    });
    await prisma.file.update({ where: { id: fileId }, data: { obs: `${TAG} Reserva de ejemplo` } });
    // Presale families already paid the deposit
    if (enPreventa) {
      const pagos = await call("GET", `/file/${fileId}/pagos`);
      await call("POST", `/file/${fileId}/pagos`, {
        fecha: iso("2026-10-20"), medio: "TRANSFERENCIA", moneda: "USD", monedaAplicada: "USD",
        importe: pagos.cuotas[0].importe, nota: "Seña preventa", pagadorId: pax[0].id,
      });
    }
    if (nombre.endsWith("x1")) shared.push(...pax);
    else await call("POST", `/grupos/${grupoId}/habitaciones`, { tipo: room, paxIds: pax.map((p) => p.id) });
  }
  await call("POST", `/grupos/${grupoId}/habitaciones`, { tipo: "DOBLE", paxIds: shared.map((p) => p.id), obs: "Compartida (dos reservas distintas)" });

  const g = (await call("GET", `/grupos/${grupoId}`)).data;
  console.log(`✅ ${titulo}: ${g.reservas.length} reservas, ${g.resumen.pasajeros} pasajeros, ${g.habitaciones.length} habitaciones`);
  console.log("   dinero:", JSON.stringify(g.resumen.dinero));
  console.log("   visas para revisar:", g.visaProblemas.map((v) => `${v.nombre}: ${v.problema}`).join(" | "));
  for (const r of g.reservas) console.log(`   ${r.nombre.padEnd(12)} ${r.habitacionTipo.padEnd(10)} total ${r.porMoneda.map((m) => m.total).join()}`);
};

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
