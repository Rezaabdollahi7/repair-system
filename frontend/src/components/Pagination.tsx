interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
}: PaginationProps) {
  if (total <= 0 || totalPages <= 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-sm text-text-secondary">
      {/* Current range */}
      <span>
        نمایش {to}–{from} از {total} دستگاه
      </span>

      {/* Page controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface-alt transition"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface-alt transition"
        >
          بعدی
        </button>

        <span className="px-3 py-1 rounded border border-border bg-primary-soft text-primary font-medium">
          {page} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface-alt transition"
        >
          قبلی
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface-alt transition"
        >
          »
        </button>
      </div>

      {/* Rows per page */}
      <select
        value={limit}
        onChange={(e) => onLimitChange(Number(e.target.value))}
        className="border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
      >
        {[5, 10, 20, 50].map((n) => (
          <option key={n} value={n}>
            {n} در صفحه
          </option>
        ))}
      </select>
    </div>
  );
}
