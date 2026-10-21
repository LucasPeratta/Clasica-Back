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

  await t.test("monedas: PESOS se acepta y ARS (valor viejo) se rechaza", async () => {
    await createService({ currency: "PESOS" });
    const ars = await post("/service/create", {
      nombre: "x", provider: "x", precioNeto: "1", tarifa: "1", currency: "ARS", type: "HOTEL",
    });
    assert.equal(ars.status, 500);
  });
});
