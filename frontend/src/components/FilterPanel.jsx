import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "pending", label: "در انتظار" },
  { value: "repairing", label: "در حال تعمیر" },
  { value: "done", label: "تعمیر شده" },
  { value: "delivered", label: "تحویل داده شده" },
];

export default function FilterPanel({ filters, onChange, onClear, customers }) {
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

  function toggleStatus(value) {
    const current = filters.status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filters, status: updated });
  }

  return (
    <div className="my-4">
      {/* دکمه باز/بسته کردن */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
        >
          <span>🔽 فیلترها</span>
          {activeCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button
            onClick={onClear}
            className="text-sm text-red-500 hover:underline"
          >
            پاک کردن فیلترها
          </button>
        )}
      </div>

      {/* پانل فیلتر */}
      {open && (
        <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* وضعیت - چند انتخابی */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              وضعیت
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleStatus(opt.value)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    filters.status?.includes(opt.value)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* مشتری */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              مشتری
            </label>
            <select
              value={filters.customer_id}
              onChange={(e) =>
                onChange({ ...filters, customer_id: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">همه مشتریان</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.phone}
                </option>
              ))}
            </select>
          </div>

          {/* بازه تاریخ ورود */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              تاریخ ورود از
            </label>
            <input
              type="date"
              value={filters.entry_from}
              onChange={(e) =>
                onChange({ ...filters, entry_from: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              تاریخ ورود تا
            </label>
            <input
              type="date"
              value={filters.entry_to}
              onChange={(e) =>
                onChange({ ...filters, entry_to: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* بازه تاریخ خروج */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              تاریخ خروج از
            </label>
            <input
              type="date"
              value={filters.exit_from}
              onChange={(e) =>
                onChange({ ...filters, exit_from: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              تاریخ خروج تا
            </label>
            <input
              type="date"
              value={filters.exit_to}
              onChange={(e) =>
                onChange({ ...filters, exit_to: e.target.value })
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
