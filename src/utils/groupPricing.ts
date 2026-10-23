import { HabitacionTipo } from "@prisma/client";

// Price of a group service for one reservation, by how the service is priced:
// - POR_PASAJERO: each passenger; children under edadMenor (at departure) pay the child price
// - POR_RESERVA: one price for the whole reservation (e.g. a rental car per family)
// - POR_HABITACION: per person, by the reservation's room type (e.g. hotels)

export const PRICING_MODES = ["POR_PASAJERO", "POR_RESERVA", "POR_HABITACION"] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export type RoomPrices = Partial<Record<HabitacionTipo, { neto: number; tarifa: number }>>;

export interface PricedService {
  modoPrecio: string;
  netoPorPax: unknown;
  tarifaPorPax: unknown;
  edadMenor: number | null;
  netoMenor: unknown;
  tarifaMenor: unknown;
  preciosHabitacion: unknown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Age in whole years on a date
export const ageAt = (dob: Date, at: Date) => {
  let age = at.getFullYear() - dob.getFullYear();
  if (at.getMonth() < dob.getMonth() || (at.getMonth() === dob.getMonth() && at.getDate() < dob.getDate())) age -= 1;
  return age;
};

// Room type that fits a number of passengers (1 = single ... 4 or more = quadruple)
export const roomTypeFor = (pax: number): HabitacionTipo =>
  pax <= 1 ? "SINGLE" : pax === 2 ? "DOBLE" : pax === 3 ? "TRIPLE" : "CUADRUPLE";

const isChild = (s: PricedService, dob: Date | null, departure: Date) =>
  s.edadMenor !== null && s.tarifaMenor !== null && s.tarifaMenor !== undefined && dob !== null && ageAt(dob, departure) < s.edadMenor;

export const linePrice = (
  s: PricedService,
  pax: { dob: Date | null }[],
  habitacionTipo: HabitacionTipo | null,
  departure: Date
) => {
  const adult = { neto: Number(s.netoPorPax) || 0, tarifa: Number(s.tarifaPorPax) || 0 };
  if (s.modoPrecio === "POR_RESERVA") return adult;

  if (s.modoPrecio === "POR_HABITACION") {
    const room = (s.preciosHabitacion as RoomPrices | null)?.[habitacionTipo ?? roomTypeFor(pax.length)];
    const perPerson = room ? { neto: Number(room.neto) || 0, tarifa: Number(room.tarifa) || 0 } : adult;
    return { neto: round2(perPerson.neto * pax.length), tarifa: round2(perPerson.tarifa * pax.length) };
  }

  let neto = 0;
  let tarifa = 0;
  for (const p of pax) {
    const child = isChild(s, p.dob, departure);
    neto += child ? Number(s.netoMenor) || 0 : adult.neto;
    tarifa += child ? Number(s.tarifaMenor) || 0 : adult.tarifa;
  }
  return { neto: round2(neto), tarifa: round2(tarifa) };
};
