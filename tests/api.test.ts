// API tests: run them with `npm test` (see scripts/test.ts), never directly against real data.
// The database here is the throwaway "_test" one, recreated empty on every run.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const API = process.env.TEST_API_URL as string;
const prisma = new PrismaClient();

const EMAIL = "test@clasica.com";
const PASSWORD = "test-password-123";
let token = "";

const request = async (path: string, options: RequestInit = {}, auth = true) => {
  const headers = new Headers(options.headers);
  if (auth) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};

const post = (path: string, data: unknown) =>
  request(path, { method: "POST", body: JSON.stringify(data) });
const put = (path: string, data: unknown) =>
  request(path, { method: "PUT", body: JSON.stringify(data) });

const daysFromToday = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const createFile = async (data: Record<string, unknown> = {}, serviceIds: string[] = [], paxIds: string[] = []) => {
  const { status, body } = await post("/file/create", {
    paxIds,
    serviceIds,
    formData: { destino: "Destino test", fechaSalida: daysFromToday(10), ...data },
  });
  assert.equal(status, 200);
  return prisma.file.findUniqueOrThrow({ where: { id: body.id } });
};

const createService = async (data: Record<string, unknown> = {}) => {
  const { status, body } = await post("/service/create", {
    nombre: "Servicio test",
    provider: "Proveedor test",
    precioNeto: "100",
    tarifa: "150",
    currency: "USD",
    type: "HOTEL",
    ...data,
  });
  assert.equal(status, 200);
  return body.id as string;
};

before(async () => {
  await prisma.user.create({
    data: { email: EMAIL, password: await bcrypt.hash(PASSWORD, 10) },
  });
  const login = await request(
    "/login",
    { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
    false
  );
  token = login.body.token;
});

after(() => prisma.$disconnect());

test("seguridad", async (t) => {
  await t.test("sin login no se puede consultar nada", async () => {
    for (const path of ["/pax", "/file", "/service", "/user"]) {
      assert.equal((await request(path, {}, false)).status, 401, path);
    }
  });

  await t.test("un pase inventado o firmado con otra clave se rechaza", async () => {
    const fake = jwt.sign({ id: "x" }, "defaultSecretKey");
    const res = await fetch(`${API}/pax`, { headers: { Authorization: `Bearer ${fake}` } });
    assert.equal(res.status, 401);
  });

  await t.test("login: contraseña incorrecta da 401 y la correcta no devuelve la contraseña", async () => {
    const wrong = await request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: EMAIL, password: "otra" }) },
      false
    );
    assert.equal(wrong.status, 401);
    assert.ok(token, "el login correcto devuelve un pase");
    const ok = await request(
      "/login",
      { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) },
      false
    );
    assert.equal(ok.body.user.password, undefined);
  });

  await t.test("no se puede crear una cuenta sin estar logueado", async () => {
    const res = await request(
      "/register",
      { method: "POST", body: JSON.stringify({ email: "x@x.com", password: "x" }) },
      false
    );
    assert.equal(res.status, 401);
  });

  await t.test("la lista de usuarios no muestra contraseñas", async () => {
    const { body } = await request("/user");
    assert.ok(body.data.length > 0);
    assert.ok(body.data.every((u: Record<string, unknown>) => !("password" in u)));
  });
});

test("pasajeros", async (t) => {
  await t.test("no se repite DNI ni pasaporte (sin importar puntos, espacios o mayúsculas)", async () => {
    const first = await post("/pax/create", {
      firstname: "Juan",
      lastname: "Pérez",
      dni: "30.111.222",
      passport: "aa 111222",
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.data.dni, "30111222");
    assert.equal(first.body.data.passport, "AA111222");

    const sameDni = await post("/pax/create", { firstname: "Otro", lastname: "X", dni: "30111222" });
    assert.equal(sameDni.status, 400);
    assert.match(sameDni.body.msg, /DNI 30111222: Pérez Juan/);

    const samePassport = await post("/pax/create", { firstname: "Otro", lastname: "X", passport: "AA111222" });
    assert.equal(samePassport.status, 400);
    assert.match(samePassport.body.msg, /pasaporte AA111222/);
  });

  await t.test("editar sin cambiar el DNI se permite; ponerle el DNI de otro, no", async () => {
    const other = await post("/pax/create", { firstname: "Ana", lastname: "Gómez", dni: "40111222" });
    const ana = other.body.data;
    const same = await put(`/pax/update/${ana.id}`, { ...ana, obs: "editado" });
    assert.equal(same.status, 200);
    const taken = await put(`/pax/update/${ana.id}`, { ...ana, dni: "30111222" });
    assert.equal(taken.status, 400);
  });

  await t.test("se busca por nombre, DNI (con o sin puntos), pasaporte y email", async () => {
    await post("/pax/create", { firstname: "Laura", lastname: "Busqueda", dni: "50111222", email: "laura@test.com" });
    for (const search of ["Busqueda", "50.111.222", "50111222", "laura@test", "aa111222"]) {
      const { body } = await request(`/pax?page=1&search=${encodeURIComponent(search)}`);
      assert.ok(body.total >= 1, `buscar "${search}"`);
    }
  });

  await t.test("paginación de a 15 con el total", async () => {
    for (let i = 0; i < 16; i++) {
      await prisma.pax.create({ data: { firstname: `P${i}`, lastname: "Paginado" } });
    }
    const page2 = await request("/pax?page=2&search=Paginado");
    assert.equal(page2.body.total, 16);
    assert.equal(page2.body.totalPages, 2);
    assert.equal(page2.body.data.length, 1);
  });

  await t.test("el listado y el perfil traen solo los próximos viajes (para avisar de documentos)", async () => {
    const pax = await prisma.pax.create({ data: { firstname: "Viajero", lastname: "Documentos" } });
    await createFile({ destino: "Pasado", fechaSalida: daysFromToday(-10) }, [], [pax.id]);
    await createFile({ destino: "Futuro", fechaSalida: daysFromToday(20) }, [], [pax.id]);

    const list = await request("/pax?page=1&search=Documentos");
    assert.deepEqual(list.body.data[0].File.map((f: { destino: string }) => f.destino), ["Futuro"]);
    const profile = await request(`/pax/${pax.id}`);
    assert.deepEqual(profile.body.data.File.map((f: { destino: string }) => f.destino), ["Futuro"]);
  });

  await t.test("se informa en qué files está un pasajero antes de borrarlo", async () => {
    const pax = await prisma.pax.create({ data: { firstname: "Con", lastname: "Files" } });
    await createFile({ destino: "Roma" }, [], [pax.id]);
    const { body } = await request(`/pax/${pax.id}/files`);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].destino, "Roma");
  });
});

test("files", async (t) => {
  await t.test("número automático por año, sin repetirse aunque se creen a la vez", async () => {
    const files = await Promise.all([createFile(), createFile(), createFile()]);
    const numbers = files.map((f) => f.numero);
    assert.equal(new Set(numbers).size, 3);
    assert.ok(files.every((f) => f.anio === new Date().getFullYear()));
  });

  await t.test("buscar por número trae ese file exacto (el 1 no trae el 11)", async () => {
    for (let i = 0; i < 12; i++) await createFile({ destino: "Numeracion" });
    const file = await prisma.file.findFirstOrThrow({ where: { numero: 1 } });
    for (const search of ["1", `01-${file.anio}`]) {
      const current = await request(`/file?page=1&search=${search}`);
      const finished = await request(`/file?page=1&status=finished&search=${search}`);
      const found = [...current.body.data, ...finished.body.data];
      assert.deepEqual(found.map((f: { numero: number }) => f.numero), [1], `buscar "${search}"`);
    }
  });

  await t.test("vigentes hasta 30 días después de la salida, después finalizados", async () => {
    for (const days of [5, 0, -29, -31, -90]) {
      await createFile({ destino: "Pestañas", fechaSalida: daysFromToday(days) });
    }
    const current = await request("/file?page=1&search=Pestañas");
    const finished = await request("/file?page=1&status=finished&search=Pestañas");
    assert.deepEqual(current.body.counts, { current: 3, finished: 2 });
    assert.equal(current.body.data.length, 3);
    assert.equal(finished.body.data.length, 2);
    // Vigentes de la fecha más vieja a la más nueva
    const dates = current.body.data.map((f: { fechaSalida: string }) => f.fechaSalida);
    assert.deepEqual(dates, [...dates].sort());
  });

  await t.test("la lista de files trae el estado de pago de cada uno", async () => {
    const flight = await createService({ type: "AEREO", tarifa: "1000" });
    const file = await createFile({ destino: "ListaCobro" }, [flight]);
    await post(`/file/${file.id}/pagos`, { fecha: daysFromToday(0), medio: "EFECTIVO", moneda: "USD", importe: 400 });
    const { body } = await request("/file?page=1&search=ListaCobro");
    assert.equal(body.data[0].cobro.moneda, "USD");
    assert.equal(body.data[0].cobro.falta, 600);
    assert.equal(body.data[0].cobro.cobrado, 400);
    assert.equal(body.data[0].cuotas, undefined);
  });

  await t.test("tarifa alternativa con moneda: se guarda, no se pierde al editar otra cosa y se quita", async () => {
    const file = await createFile({ tarifaAlternativa: "10500", tarifaAlternativaMoneda: "USD" });
    assert.equal(file.tarifaAlternativa, "10500");
    assert.equal(file.tarifaAlternativaMoneda, "USD");

    await put(`/file/update/${file.id}`, {
      formData: { destino: "Editado", fechaSalida: daysFromToday(10), tarifaAlternativa: "10500" },
    });
    let saved = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    assert.equal(saved.tarifaAlternativaMoneda, "USD");

    await put(`/file/update/${file.id}`, {
      formData: { destino: "Editado", fechaSalida: daysFromToday(10), tarifaAlternativa: "", tarifaAlternativaMoneda: null },
    });
    saved = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    assert.equal(saved.tarifaAlternativa, null);
    assert.equal(saved.tarifaAlternativaMoneda, null);
  });

  await t.test("borrar un file elimina sus servicios pero no sus pasajeros", async () => {
    const pax = await prisma.pax.create({ data: { firstname: "Se", lastname: "Queda" } });
    const serviceId = await createService();
    const file = await createFile({}, [serviceId], [pax.id]);
    assert.equal((await request(`/file/${file.id}`, { method: "DELETE" })).status, 200);
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    assert.ok(service.deleted_at);
    assert.ok(await prisma.pax.findUnique({ where: { id: pax.id } }));
  });

  await t.test("borrar un file que no existe informa el error", async () => {
    assert.equal((await request("/file/no-existe", { method: "DELETE" })).status, 500);
  });

  await t.test("solo se aceptan documentos PDF, Word o Excel", async () => {
    const file = await createFile();
    const form = new FormData();
    form.append("pdfs", new Blob(["hola"], { type: "text/plain" }), "nota.txt");
    const res = await request(`/file/${file.id}/pdfs`, { method: "POST", body: form });
    assert.equal(res.status, 400);
    assert.match(res.body.msg, /PDF, Word o Excel/);
  });
});

test("pagos de clientes", async (t) => {
  // Aéreo USD 1.200 + hotel USD 1.600 = USD 2.800, salida en 60 días
  const newFileWithServices = async (fileData: Record<string, unknown> = {}) => {
    const flight = await createService({ type: "AEREO", precioNeto: "1000", tarifa: "1200" });
    const hotel = await createService({ type: "HOTEL", precioNeto: "1300", tarifa: "1600" });
    return createFile({ fechaSalida: daysFromToday(60), ...fileData }, [flight, hotel]);
  };
  const pay = (fileId: string, data: Record<string, unknown>) =>
    post(`/file/${fileId}/pagos`, { fecha: daysFromToday(0), medio: "TRANSFERENCIA", moneda: "USD", ...data });

  await t.test("plan automático: seña = aéreos al crear, saldo 25 días antes de la salida", async () => {
    const file = await newFileWithServices();
    const { body } = await request(`/file/${file.id}/pagos`);
    assert.equal(body.moneda, "USD");
    assert.equal(body.total, 2800);
    assert.deepEqual(body.cuotas.map((c: { concepto: string; importe: number }) => [c.concepto, c.importe]), [
      ["Seña (aéreos)", 1200],
      ["Saldo", 1600],
    ]);
    assert.equal(body.cuotas[0].diasParaVencer, 0);
    assert.equal(body.cuotas[1].diasParaVencer, 35);
    assert.equal(body.estado, "POR_VENCER"); // la seña vence hoy
    assert.equal(body.falta, 2800);
  });

  await t.test("con tarifa alternativa se cobra eso (el saldo se ajusta)", async () => {
    const file = await newFileWithServices({ tarifaAlternativa: "3000", tarifaAlternativaMoneda: "USD" });
    const { body } = await request(`/file/${file.id}/pagos`);
    assert.equal(body.total, 3000);
    assert.equal(body.cuotas[1].importe, 1800);
  });

  await t.test("monedas mezcladas sin tarifa alternativa: pide definir la moneda", async () => {
    const usd = await createService({ currency: "USD" });
    const pesos = await createService({ currency: "PESOS" });
    const file = await createFile({}, [usd, pesos]);
    const { body } = await request(`/file/${file.id}/pagos`);
    assert.equal(body.problema, "MIXED_CURRENCIES");
    const res = await pay(file.id, { importe: 100 });
    assert.equal(res.status, 400);
    assert.match(res.body.msg, /tarifa alternativa/);
  });

  await t.test("los pagos se aplican primero a la seña y después al saldo", async () => {
    const file = await newFileWithServices();
    let res = await pay(file.id, { importe: 1000 });
    assert.equal(res.status, 200);
    assert.equal(res.body.cuotas[0].estado, "PARCIAL");
    assert.equal(res.body.cuotas[0].falta, 200);

    res = await pay(file.id, { importe: 500 });
    assert.equal(res.body.cuotas[0].estado, "PAGADA");
    assert.equal(res.body.cuotas[1].pagado, 300);
    assert.equal(res.body.cobrado, 1500);
    assert.equal(res.body.falta, 1300);
  });

  await t.test("pago en pesos con tipo de cambio: se descuenta lo equivalente en dólares", async () => {
    const file = await newFileWithServices();
    const noRate = await pay(file.id, { moneda: "PESOS", importe: 1200000 });
    assert.equal(noRate.status, 400);
    assert.match(noRate.body.msg, /tipo de cambio/);

    const res = await pay(file.id, { moneda: "PESOS", importe: 1200000, tipoCambio: 1000 });
    assert.equal(res.status, 200);
    assert.equal(res.body.pagos[0].importeAplicado, 1200);
    assert.equal(res.body.cuotas[0].estado, "PAGADA");
  });

  await t.test("corregir y borrar un pago", async () => {
    const file = await newFileWithServices();
    const created = await pay(file.id, { importe: 100, nota: "primero" });
    const pagoId = created.body.pagos[0].id;

    const updated = await put(`/file/${file.id}/pagos/${pagoId}`, {
      fecha: daysFromToday(0), importe: 700, moneda: "USD", medio: "EFECTIVO", nota: "corregido",
    });
    assert.equal(updated.body.cobrado, 700);
    assert.equal(updated.body.pagos[0].medio, "EFECTIVO");

    const deleted = await request(`/file/${file.id}/pagos/${pagoId}`, { method: "DELETE" });
    assert.equal(deleted.body.cobrado, 0);
    assert.equal(deleted.body.pagos.length, 0);
  });

  await t.test("plan propio del administrador, validación y volver al automático", async () => {
    const file = await newFileWithServices();
    const bad = await put(`/file/${file.id}/plan`, { cuotas: [{ concepto: "", importe: 0 }] });
    assert.equal(bad.status, 400);

    const own = await put(`/file/${file.id}/plan`, {
      cuotas: [
        { concepto: "Seña", importe: 1500, vencimiento: daysFromToday(1) },
        { concepto: "Cuota 2", importe: 650, vencimiento: daysFromToday(20) },
        { concepto: "Cuota 3", importe: 650, vencimiento: daysFromToday(40) },
      ],
    });
    assert.equal(own.status, 200);
    assert.equal(own.body.planPersonalizado, true);
    assert.equal(own.body.cuotas.length, 3);
    assert.equal(own.body.planTotal, 2800);

    const reset = await request(`/file/${file.id}/plan`, { method: "DELETE" });
    assert.equal(reset.body.planPersonalizado, false);
    assert.equal(reset.body.cuotas.length, 2);
  });

  await t.test("cobranzas: vencidos, esta semana y este mes", async () => {
    // Salida en 10 días: el saldo venció hace 15 días
    const overdue = await newFileWithServices({ destino: "CobranzaVencida", fechaSalida: daysFromToday(10) });
    // Salida en 30 días: el saldo vence en 5 días
    const soon = await newFileWithServices({ destino: "CobranzaSemana", fechaSalida: daysFromToday(30) });
    await pay(overdue.id, { importe: 1200 });
    await pay(soon.id, { importe: 1200 });
    // Pagado completo: no aparece
    const paid = await newFileWithServices({ destino: "CobranzaPagada" });
    await pay(paid.id, { importe: 2800 });

    const vencidos = await request("/cobranzas?filtro=vencidos&search=Cobranza");
    assert.deepEqual(vencidos.body.data.map((f: { destino: string }) => f.destino), ["CobranzaVencida"]);
    assert.equal(vencidos.body.data[0].falta, 1600);

    const semana = await request("/cobranzas?filtro=semana&search=Cobranza");
    assert.deepEqual(semana.body.data.map((f: { destino: string }) => f.destino), ["CobranzaSemana"]);

    const todos = await request("/cobranzas?search=Cobranza");
    assert.equal(todos.body.counts.todos, 2);
    assert.ok(!todos.body.data.some((f: { destino: string }) => f.destino === "CobranzaPagada"));
  });

  await t.test("historial de cobros: del más nuevo al más viejo, con su file y pasajero", async () => {
    const pax = await prisma.pax.create({ data: { firstname: "Historial", lastname: "Cobros" } });
    const flight = await createService({ type: "AEREO", tarifa: "1000" });
    const file = await createFile({ destino: "HistorialCobros" }, [flight], [pax.id]);
    await pay(file.id, { importe: 300, fecha: daysFromToday(-2) });
    await pay(file.id, { importe: 200, fecha: daysFromToday(0) });

    const { body } = await request("/cobranzas/pagos?page=1&search=Historial");
    assert.deepEqual(body.data.map((p: { importe: number }) => p.importe), [200, 300]);
    assert.equal(body.data[0].file.destino, "HistorialCobros");
    assert.equal(body.data[0].pasajero.lastname, "Cobros");

    const byNumber = await request(`/cobranzas/pagos?page=1&search=${file.numero}-${file.anio}`);
    assert.equal(byNumber.body.total, 2);
  });

  await t.test("historial de cobros filtrado por rango de fechas, con el total del período", async () => {
    const ymd = (days: number) => {
      const d = new Date(daysFromToday(days));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const flight = await createService({ type: "AEREO", tarifa: "5000" });
    const file = await createFile({ destino: "RangoFechas" }, [flight]);
    await pay(file.id, { importe: 100, fecha: daysFromToday(-10) });
    await pay(file.id, { importe: 200, fecha: daysFromToday(-5) });
    await pay(file.id, { importe: 300, fecha: daysFromToday(-1) });

    const { body } = await request(`/cobranzas/pagos?page=1&search=RangoFechas&desde=${ymd(-6)}&hasta=${ymd(-1)}`);
    assert.deepEqual(body.data.map((p: { importe: number }) => p.importe), [300, 200]);
    assert.deepEqual(body.totals, { USD: 500 });
  });

  await t.test("marcar un servicio como liquidado (y desmarcarlo)", async () => {
    const serviceId = await createService();
    let res = await request(`/service/${serviceId}/liquidado`, {
      method: "PATCH", body: JSON.stringify({ liquidado: true }),
    });
    assert.equal(res.body.data.liquidado, true);
    assert.ok(res.body.data.liquidadoAt);
    res = await request(`/service/${serviceId}/liquidado`, {
      method: "PATCH", body: JSON.stringify({ liquidado: false }),
    });
    assert.equal(res.body.data.liquidado, false);
    assert.equal(res.body.data.liquidadoAt, null);
  });
});

test("pagos a mayoristas", async (t) => {
  const payWholesaler = (data: Record<string, unknown>) =>
    post("/mayoristas/pagos", { fecha: daysFromToday(0), medio: "TRANSFERENCIA", ...data });

  await t.test("un pago se reparte entre servicios de distintos files", async () => {
    const pax = await prisma.pax.create({ data: { firstname: "Mayorista", lastname: "Reparto" } });
    const flight = await createService({ type: "AEREO", provider: "Despegar", precioNeto: "6000", tarifa: "7000" });
    const hotel = await createService({ type: "HOTEL", provider: "Despegar", precioNeto: "5000", tarifa: "6000" });
    await createFile({ destino: "Roma" }, [flight], [pax.id]);
    await createFile({ destino: "Paris" }, [hotel], [pax.id]);

    const search = await request("/mayoristas/servicios?search=Reparto");
    assert.equal(search.body.data.length, 2);
    assert.equal(search.body.data[0].services[0].falta > 0, true);

    const res = await payWholesaler({
      aplicaciones: [
        { serviceId: flight, importe: 6000 },
        { serviceId: hotel, importe: 4000 },
      ],
    });
    assert.equal(res.status, 200);

    const pending = await request("/mayoristas/pendientes?page=1&search=Reparto");
    // El vuelo quedó pagado; del hotel (file de París) faltan 1.000. Una fila por file
    assert.equal(pending.body.data.length, 1);
    assert.equal(pending.body.data[0].file.destino, "Paris");
    assert.deepEqual(pending.body.data[0].mayoristas, [
      {
        mayorista: "Despegar",
        currency: "USD",
        falta: 1000,
        servicios: [{ id: hotel, nombre: "Servicio test", type: "HOTEL", falta: 1000 }],
      },
    ]);

    const history = await request("/mayoristas/pagos?page=1&search=Despegar");
    assert.equal(history.body.data[0].importe, 10000);
    assert.equal(history.body.data[0].mayorista, "Despegar");
    assert.equal(history.body.data[0].aplicaciones.length, 2);
  });

  await t.test("no se mezclan monedas ni se paga más de lo pendiente", async () => {
    const usd = await createService({ precioNeto: "100", currency: "USD" });
    const pesos = await createService({ precioNeto: "100", currency: "PESOS" });
    await createFile({}, [usd]);
    await createFile({}, [pesos]);

    const mixed = await payWholesaler({
      aplicaciones: [{ serviceId: usd, importe: 50 }, { serviceId: pesos, importe: 50 }],
    });
    assert.equal(mixed.status, 400);

    const tooMuch = await payWholesaler({ aplicaciones: [{ serviceId: usd, importe: 150 }] });
    assert.equal(tooMuch.status, 400);
  });

  await t.test("borrar un pago vuelve a dejar pendiente el servicio", async () => {
    const serviceId = await createService({ provider: "ProvBorrar", precioNeto: "300" });
    await createFile({}, [serviceId]);
    await payWholesaler({ aplicaciones: [{ serviceId, importe: 300 }] });
    let pending = await request("/mayoristas/pendientes?page=1&search=ProvBorrar");
    assert.equal(pending.body.total, 0);

    const history = await request("/mayoristas/pagos?page=1&search=ProvBorrar");
    await request(`/mayoristas/pagos/${history.body.data[0].id}`, { method: "DELETE" });
    pending = await request("/mayoristas/pendientes?page=1&search=ProvBorrar");
    assert.equal(pending.body.data[0].mayoristas[0].falta, 300);
  });

  await t.test("pendiente: un file con varios servicios es una sola fila, agrupada por mayorista", async () => {
    const a = await createService({ provider: "ProvAgrupa", precioNeto: "100" });
    const b = await createService({ provider: "ProvAgrupa", precioNeto: "200" });
    const c = await createService({ provider: "OtroAgrupa", precioNeto: "50" });
    await createFile({ destino: "AgrupaDestino" }, [a, b, c]);

    const { body } = await request("/mayoristas/pendientes?page=1&search=AgrupaDestino");
    assert.equal(body.data.length, 1);
    const groups = Object.fromEntries(
      body.data[0].mayoristas.map((m: { mayorista: string; falta: number; servicios: unknown[] }) => [m.mayorista, [m.falta, m.servicios.length]])
    );
    assert.deepEqual(groups, { ProvAgrupa: [300, 2], OtroAgrupa: [50, 1] });
  });

  await t.test("el detalle del file trae lo pagado al mayorista por servicio", async () => {
    const serviceId = await createService({ precioNeto: "800" });
    const file = await createFile({}, [serviceId]);
    await payWholesaler({ aplicaciones: [{ serviceId, importe: 500 }] });
    const { body } = await request(`/file/${file.id}`);
    assert.deepEqual(body.data.services[0].pagosMayorista.map((p: { importe: string }) => Number(p.importe)), [500]);
  });
});

test("inicio", async (t) => {
  await t.test("junta salidas, cobros, mayoristas, servicios sin liquidar y documentos", async () => {
    const pax = await prisma.pax.create({
      data: {
        firstname: "Inicio",
        lastname: "Tablero",
        passportVto: new Date(daysFromToday(3)), // vence antes del viaje
        dniVto: new Date(daysFromToday(100)), // vence en los próximos 6 meses
      },
    });
    const flight = await createService({ type: "AEREO", provider: "ProvInicio", precioNeto: "500", tarifa: "700" });
    const file = await createFile({ destino: "InicioDestino", fechaSalida: daysFromToday(5) }, [flight], [pax.id]);

    const { status, body } = await request("/inicio");
    assert.equal(status, 200);

    const departure = body.proximasSalidas.find((f: { id: string }) => f.id === file.id);
    assert.equal(departure.diasParaSalida, 5);
    assert.equal(departure.sinLiquidar, 1);

    // Las listas muestran hasta 8; la base de pruebas ya tiene muchos files, así que se controlan los totales
    assert.ok(body.cobros.semana >= 1);
    assert.ok(body.cobros.items.length <= 8);
    assert.ok(body.mayoristas.semana + body.mayoristas.vencidos >= 1);
    // Próximos pagos a mayoristas: agrupados por file y mayorista, del vencimiento más próximo al más lejano
    const days = body.mayoristas.items.map((m: { diasParaVencer: number }) => m.diasParaVencer);
    assert.deepEqual(days, [...days].sort((a: number, b: number) => a - b));
    assert.ok(body.mayoristas.items.every((m: { servicios: number; mayorista: string }) => m.servicios >= 1 && "mayorista" in m));
    assert.ok(body.sinLiquidar.total >= 1);
    // Sin liquidar: todos los de viajes que todavía no salieron, del más próximo al más lejano
    const unsettledDays = body.sinLiquidar.items.map((s: { diasParaSalida: number }) => s.diasParaSalida);
    assert.ok(unsettledDays.every((d: number) => d >= 0));
    assert.deepEqual(unsettledDays, [...unsettledDays].sort((a: number, b: number) => a - b));

    const docs = body.documentos.items.filter((d: { paxId: string }) => d.paxId === pax.id);
    assert.equal(docs.length, 2);
    assert.match(docs[0].problema, /Vence antes del viaje a InicioDestino/);
    assert.equal(docs[1].documento, "DNI");
    assert.equal(docs[1].problema, null);
  });
});

test("servicios", async (t) => {
  await t.test("la lista muestra a qué file pertenece y oculta los sueltos", async () => {
    const loose = await createService({ nombre: "Suelto", provider: "ProvLista" });
    const inFile = await createService({ nombre: "En file", provider: "ProvLista" });
    const file = await createFile({ destino: "Lista" }, [inFile]);

    const { body } = await request("/service?page=1&search=ProvLista");
    const ids = body.data.map((s: { id: string }) => s.id);
    assert.ok(ids.includes(inFile));
    assert.ok(!ids.includes(loose));
    assert.equal(body.data[0].File[0].numero, file.numero);
  });

  await t.test("se buscan por número de file", async () => {
    const serviceId = await createService({ provider: "ProvNumero" });
    const file = await createFile({}, [serviceId]);
    const { body } = await request(`/service?page=1&search=${file.numero}-${file.anio}`);
    assert.deepEqual(body.data.map((s: { id: string }) => s.id), [serviceId]);
  });

  await t.test("sacar un servicio del file lo elimina", async () => {
    const keep = await createService();
    const remove = await createService();
    const file = await createFile({}, [keep, remove]);
    await put(`/file/update/${file.id}`, { serviceIds: [keep] });
    const removed = await prisma.service.findUniqueOrThrow({ where: { id: remove } });
    assert.ok(removed.deleted_at);
  });

  await t.test("eliminar un servicio lo saca de su file", async () => {
    const serviceId = await createService();
    const file = await createFile({}, [serviceId]);
    await request(`/service/${serviceId}`, { method: "DELETE" });
    const updated = await prisma.file.findUniqueOrThrow({
      where: { id: file.id },
      include: { services: true },
    });
    assert.equal(updated.services.length, 0);
  });

  await t.test("el mayorista es obligatorio y se sugieren los ya usados (sin repetir por espacios o mayúsculas)", async () => {
    const noProvider = await post("/service/create", {
      nombre: "x", provider: "  ", precioNeto: "1", tarifa: "1", currency: "USD", type: "HOTEL",
    });
    assert.equal(noProvider.status, 400);
    assert.match(noProvider.body.msg, /mayorista/);

    const id = await createService({ provider: "  Mayorista Sugerido  " });
    await createService({ provider: "mayorista sugerido" });
    const saved = await prisma.service.findUniqueOrThrow({ where: { id } });
    assert.equal(saved.provider, "Mayorista Sugerido");

    const { body } = await request("/service/proveedores");
    const matches = body.data.filter((p: string) => p.toLowerCase() === "mayorista sugerido");
    assert.equal(matches.length, 1);
  });

  await t.test("monedas: PESOS se acepta y ARS (valor viejo) se rechaza", async () => {
    await createService({ currency: "PESOS" });
    const ars = await post("/service/create", {
      nombre: "x", provider: "x", precioNeto: "1", tarifa: "1", currency: "ARS", type: "HOTEL",
    });
    assert.equal(ars.status, 500);
  });
});
