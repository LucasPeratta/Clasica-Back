import { Currency, Prisma } from "@prisma/client";

// Client payments of a file: what has to be charged, the payment plan and its status.
// Everything is calculated here so the file screen, "Cobranzas" and the home page agree.

// Balance is due this many days before departure
export const BALANCE_DAYS_BEFORE_DEPARTURE = 25;
// An installment is "about to expire" this many days before its due date
export const DUE_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n: number) => Math.round(n * 100) / 100;
const toNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const startOfDay = (date: Date = new Date()) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

// What the payments logic needs from a file
export const filePaymentsInclude = {
  services: {
    where: { deleted_at: null },
    select: { type: true, tarifa: true, currency: true },
  },
  cuotas: { orderBy: [{ vencimiento: "asc" as const }, { createdAt: "asc" as const }] },
  pagos: {
    orderBy: [{ fecha: "asc" as const }, { createdAt: "asc" as const }],
    // Who paid and the receipt number
    include: {
      pagador: { select: { id: true, firstname: true, lastname: true } },
      recibo: { select: { numero: true } },
    },
  },
} satisfies Prisma.FileInclude;

export type FileWithPayments = Prisma.FileGetPayload<{ include: typeof filePaymentsInclude }>;

export type ChargeProblem = "MIXED_CURRENCIES" | "NOTHING_TO_CHARGE";

// What has to be charged: the alternative tariff if set, otherwise the sum of the services
export const getCharge = (file: FileWithPayments) => {
  const alternative = toNumber(file.tarifaAlternativa);
  if (file.tarifaAlternativa && alternative > 0 && file.tarifaAlternativaMoneda) {
    return { currency: file.tarifaAlternativaMoneda, total: round2(alternative), problem: null };
  }

  const currencies = [...new Set(file.services.map((s) => s.currency))];
  if (currencies.length > 1) {
    return { currency: null, total: 0, problem: "MIXED_CURRENCIES" as ChargeProblem };
  }
  const total = round2(file.services.reduce((sum, s) => sum + toNumber(s.tarifa), 0));
  if (currencies.length === 0 || total <= 0) {
    return { currency: null, total: 0, problem: "NOTHING_TO_CHARGE" as ChargeProblem };
  }
  return { currency: currencies[0], total, problem: null };
};

// Automatic plan: deposit = flights' tariff (paid at issuance, i.e. when the file is
// created) and balance = the rest, due BALANCE_DAYS_BEFORE_DEPARTURE days before departure
export const getAutomaticPlan = (file: FileWithPayments, currency: Currency, total: number) => {
  const flights = file.services
    .filter((s) => s.type === "AEREO" && s.currency === currency)
    .reduce((sum, s) => sum + toNumber(s.tarifa), 0);
  const deposit = round2(Math.min(flights, total));
  const balance = round2(total - deposit);

  const balanceDue = new Date(file.fechaSalida.getTime() - BALANCE_DAYS_BEFORE_DEPARTURE * DAY_MS);

  const cuotas = [];
  if (deposit > 0) cuotas.push({ concepto: "Seña (aéreos)", importe: deposit, vencimiento: file.createdAt });
  if (balance > 0) cuotas.push({ concepto: "Saldo", importe: balance, vencimiento: balanceDue });
  return cuotas;
};

export type InstallmentStatus = "PAGADA" | "PARCIAL" | "PENDIENTE";
export type PaymentsStatus = "SIN_PLAN" | "PAGADO" | "VENCIDO" | "POR_VENCER" | "AL_DIA";

/**
 * Full payments picture of a file. Payments are applied in order: first to the earliest
 * installment, then to the next one.
 */
export const getPaymentsSummary = (file: FileWithPayments) => {
  const charge = getCharge(file);
  const today = startOfDay();

  const plan = file.planPersonalizado
    ? file.cuotas.map((c) => ({
        id: c.id as string | null,
        concepto: c.concepto,
        importe: toNumber(c.importe),
        vencimiento: c.vencimiento,
      }))
    : charge.currency
      ? getAutomaticPlan(file, charge.currency, charge.total).map((c) => ({ id: null, ...c }))
      : [];

  const cobrado = round2(file.pagos.reduce((sum, p) => sum + toNumber(p.importeAplicado), 0));
  const planTotal = round2(plan.reduce((sum, c) => sum + c.importe, 0));

  let remainingPaid = cobrado;
  const cuotas = plan.map((c) => {
    const pagado = round2(Math.min(Math.max(remainingPaid, 0), c.importe));
    remainingPaid = round2(remainingPaid - pagado);
    const falta = round2(c.importe - pagado);
    const estado: InstallmentStatus = falta <= 0 ? "PAGADA" : pagado > 0 ? "PARCIAL" : "PENDIENTE";
    // Calendar days (not hours) until the due date
    const diasParaVencer = Math.round(
      (startOfDay(c.vencimiento).getTime() - today.getTime()) / DAY_MS
    );
    return {
      ...c,
      pagado,
      falta,
      estado,
      vencida: falta > 0 && diasParaVencer < 0,
      diasParaVencer,
    };
  });

  const falta = round2(Math.max(planTotal - cobrado, 0));
  const proxima = cuotas.find((c) => c.falta > 0) ?? null;

  let estado: PaymentsStatus;
  if (plan.length === 0) estado = "SIN_PLAN";
  else if (falta <= 0) estado = "PAGADO";
  else if (cuotas.some((c) => c.vencida)) estado = "VENCIDO";
  else if (proxima && proxima.diasParaVencer <= DUE_SOON_DAYS) estado = "POR_VENCER";
  else estado = "AL_DIA";

  return {
    moneda: charge.currency,
    total: charge.total,
    problema: charge.problem,
    planPersonalizado: file.planPersonalizado,
    // The custom plan may not add up to the total (e.g. after changing the tariff)
    planTotal,
    cuotas,
    cobrado,
    falta,
    // Overpayment (paid more than the plan)
    aFavor: round2(Math.max(cobrado - planTotal, 0)),
    proximoVencimiento: proxima
      ? { concepto: proxima.concepto, falta: proxima.falta, vencimiento: proxima.vencimiento, diasParaVencer: proxima.diasParaVencer }
      : null,
    estado,
  };
};

export class PaymentError extends Error {}

/**
 * How much of the file's charge currency a payment covers. The exchange rate is always
 * "pesos per 1 dollar/euro" when one side is pesos; between dollars and euros it is
 * "how much of the file's currency is 1 unit of the paid currency".
 */
export const getAppliedAmount = (
  importe: number,
  paidCurrency: Currency,
  chargeCurrency: Currency,
  tipoCambio?: number | null
) => {
  if (paidCurrency === chargeCurrency) return round2(importe);
  if (!tipoCambio || tipoCambio <= 0) {
    throw new PaymentError("Falta el tipo de cambio para un pago en otra moneda");
  }
  if (paidCurrency === "PESOS") return round2(importe / tipoCambio);
  if (chargeCurrency === "PESOS") return round2(importe * tipoCambio);
  return round2(importe * tipoCambio);
};
