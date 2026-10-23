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
  // Group reservations: the plan chosen among the group's
  grupoPlan: { select: { cuotas: true } },
} satisfies Prisma.FileInclude;

export type FileWithPayments = Prisma.FileGetPayload<{ include: typeof filePaymentsInclude }>;

export type ChargeProblem = "MIXED_CURRENCIES" | "NOTHING_TO_CHARGE";

// What has to be charged: the alternative tariff if set, otherwise the sum of the services
// Only what the charge depends on (so it can also be used with light queries)
type ChargeInput = Pick<FileWithPayments, "tarifaAlternativa" | "tarifaAlternativaMoneda"> & {
  services: Pick<FileWithPayments["services"][number], "currency" | "tarifa">[];
};

export const getCharge = (file: ChargeInput) => {
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

type PlanItem = { id: string | null; concepto: string; importe: number; vencimiento: Date };
type PaymentLike = { importeAplicado: unknown };

/**
 * Payments picture of one charge (one currency): payments are applied in order, first to the
 * earliest installment, then to the next one.
 */
const summarizeCharge = (plan: PlanItem[], pagos: PaymentLike[]) => {
  const today = startOfDay();
  const cobrado = round2(pagos.reduce((sum, p) => sum + toNumber(p.importeAplicado), 0));
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

// Worst status first: what the lists show for a reservation with several currencies
const STATUS_PRIORITY: PaymentsStatus[] = ["VENCIDO", "POR_VENCER", "AL_DIA", "PAGADO", "SIN_PLAN"];

// Order to pick the main currency of a reservation
const CURRENCY_ORDER: Currency[] = ["USD", "EURO", "PESOS"];

export interface GroupPlanInstallment {
  concepto: string;
  // % of the reservation's total in each currency; null = the balance (whatever is left)
  porcentaje: number | null;
  vencimiento: string;
}

// Installments of a group plan for one currency's total
export const applyGroupPlan = (installments: GroupPlanInstallment[], total: number): PlanItem[] => {
  let assigned = 0;
  return installments.map((c, i) => {
    const isBalance = c.porcentaje === null || i === installments.length - 1;
    const importe = isBalance ? round2(total - assigned) : round2((total * toNumber(c.porcentaje)) / 100);
    assigned = round2(assigned + importe);
    return { id: null, concepto: c.concepto, importe: Math.max(importe, 0), vencimiento: new Date(c.vencimiento) };
  });
};

/**
 * Group reservation: each currency is charged apart (e.g. the package in dollars and a transfer
 * in Buenos Aires in pesos). The plan of each currency is the one loaded by hand for it, else
 * the group plan chosen, else the automatic one.
 */
const getReservationSummary = (file: FileWithPayments) => {
  const totals = new Map<Currency, number>();
  for (const s of file.services) totals.set(s.currency, round2((totals.get(s.currency) ?? 0) + toNumber(s.tarifa)));
  const currencies = CURRENCY_ORDER.filter((c) => (totals.get(c) ?? 0) > 0);
  if (currencies.length === 0) {
    return { ...summarizeCharge([], []), moneda: null, total: 0, problema: "NOTHING_TO_CHARGE" as ChargeProblem, planPersonalizado: false, porMoneda: [] };
  }
  const groupPlan = (file.grupoPlan?.cuotas ?? null) as GroupPlanInstallment[] | null;

  const porMoneda = currencies.map((moneda) => {
    const total = totals.get(moneda)!;
    const custom = file.cuotas.filter((c) => c.moneda === moneda);
    const plan: PlanItem[] =
      custom.length > 0
        ? custom.map((c) => ({ id: c.id, concepto: c.concepto, importe: toNumber(c.importe), vencimiento: c.vencimiento }))
        : groupPlan && groupPlan.length > 0
          ? applyGroupPlan(groupPlan, total)
          : getAutomaticPlan(file, moneda, total).map((c) => ({ id: null, ...c }));
    const pagos = file.pagos.filter((p) => (p.monedaAplicada ?? currencies[0]) === moneda);
    return { moneda, total, planPersonalizado: custom.length > 0, ...summarizeCharge(plan, pagos) };
  });

  const main = porMoneda[0];
  const nextDue = porMoneda
    .filter((p) => p.proximoVencimiento)
    .sort((a, b) => a.proximoVencimiento!.vencimiento.getTime() - b.proximoVencimiento!.vencimiento.getTime())[0];
  return {
    ...main,
    problema: null,
    // The earliest due date of any currency (with its currency)
    proximoVencimiento: nextDue ? { ...nextDue.proximoVencimiento!, moneda: nextDue.moneda } : null,
    estado: STATUS_PRIORITY.find((status) => porMoneda.some((p) => p.estado === status)) ?? main.estado,
    porMoneda,
  };
};

/**
 * Full payments picture of a file. porMoneda has one entry per charged currency (more than one
 * only in group reservations); the top-level fields are the main currency's.
 */
export const getPaymentsSummary = (file: FileWithPayments) => {
  if (file.grupoId) return getReservationSummary(file);

  const charge = getCharge(file);
  const plan: PlanItem[] = file.planPersonalizado
    ? file.cuotas.map((c) => ({
        id: c.id as string | null,
        concepto: c.concepto,
        importe: toNumber(c.importe),
        vencimiento: c.vencimiento,
      }))
    : charge.currency
      ? getAutomaticPlan(file, charge.currency, charge.total).map((c) => ({ id: null, ...c }))
      : [];
  const summary = summarizeCharge(plan, file.pagos);
  const part = { moneda: charge.currency, total: charge.total, planPersonalizado: file.planPersonalizado, ...summary };

  return {
    ...part,
    problema: charge.problem,
    proximoVencimiento: summary.proximoVencimiento ? { ...summary.proximoVencimiento, moneda: charge.currency } : null,
    porMoneda: charge.currency ? [part] : [],
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
