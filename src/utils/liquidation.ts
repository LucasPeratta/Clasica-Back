// When a service has to be settled ("liquidado") with the wholesaler. Each service can have
// its own deadline; if it has none, it's one month before departure.
// Flights are not settled: they are paid when the ticket is issued.

// Same day one month earlier (31/03 -> 28 or 29/02)
export const oneMonthBefore = (date: Date) => {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() - 1);
  const daysInMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInMonth));
  return result;
};

export const liquidationDate = (fechaLiquidacion: Date | null | undefined, fechaSalida: Date) =>
  fechaLiquidacion ?? oneMonthBefore(fechaSalida);

// Request value -> Date, or null (= use the default). Invalid values also count as null
export const parseLiquidationDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return isNaN(date.getTime()) ? null : date;
};
