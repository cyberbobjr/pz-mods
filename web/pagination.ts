export const PAGE_SIZES = [12, 24, 36, 60, 100] as const;
export const DEFAULT_PAGE_SIZE = 36;
export const PAGE_SIZE_STORAGE_KEY = 'pz-mods-page-size';

export function readPageSize(stored: string | null) {
  const value = Number(stored);
  return PAGE_SIZES.some((size) => size === value) ? value : DEFAULT_PAGE_SIZE;
}

export function paginate(total: number, requestedPage: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, requestedPage));
  const start = (page - 1) * pageSize;
  return { page, pageCount, start, end: Math.min(start + pageSize, total) };
}
