import { Request } from "express";

export const PAGE_SIZE = 15;

// Paginated mode is opt-in: only when the request includes ?page=
export const isPaginatedRequest = (req: Request) => req.query.page !== undefined;

export const getPaginationParams = (req: Request) => {
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const terms = search.trim().split(/\s+/).filter(Boolean);

  return { page, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, terms };
};

// Optional date range from ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (both days included),
// as a Prisma date filter; undefined when there is no range
export const getDateRange = (req: Request) => {
  const parse = (value: unknown) =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null;
  const desde = parse(req.query.desde);
  const hastaDay = parse(req.query.hasta);
  const hasta = hastaDay ? new Date(hastaDay.getTime() + 24 * 60 * 60 * 1000) : null;
  if (!desde && !hasta) return undefined;
  return { ...(desde && { gte: desde }), ...(hasta && { lt: hasta }) };
};

export const buildPage =<T>(data: T[], total: number, page: number) => ({
  data,
  total,
  page,
  pageSize: PAGE_SIZE,
  totalPages: Math.ceil(total / PAGE_SIZE),
});
