export type PaginationInput = {
  page?: number;
  limit?: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
};

export function normalizePagination(input: PaginationInput) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 10));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export function buildPaginationMeta(
  page: number,
  limit: number,
  totalItems: number,
): PaginationMeta {
  return {
    page,
    limit,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / limit)),
  };
}
