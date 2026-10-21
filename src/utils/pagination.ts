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

export const buildPage = <T>(data: T[], total: number, page: number) => ({
  data,
  total,
  page,
  pageSize: PAGE_SIZE,
  totalPages: Math.ceil(total / PAGE_SIZE),
});
