// frontend/src/components/Pagination.jsx
export default function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
}) {
  if (total <= 0 || totalPages <= 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-sm text-gray-600">
      {/* نمایش بازه */}
      <span>
        نمایش {to}–{from}  از {total} دستگاه
      </span>

      {/* دکمه‌های صفحه‌بندی */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100 transition"
        >
          «
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-gray-100 transition"
        >
          بعدی
        </button>

        <span className="px-3 py-1 rounded border bg-blue-50 text-blue-700 font-medium">
          {page} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="px-3 py-1 rounded border disabled:opacity-40 hover:bg-gray-100 transition"
        >
          قبلی
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100 transition"
        >
          »
        </button>
      </div>

      {/* تعداد در هر صفحه */}
      <select
        value={limit}
        onChange={(e) => onLimitChange(Number(e.target.value))}
        className="border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
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
