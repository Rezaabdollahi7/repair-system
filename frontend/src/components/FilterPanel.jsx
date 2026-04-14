import { useState, useRef, useEffect } from "react";

const STATUS_OPTIONS = [
  { value: "pending", label: "در انتظار" },
  { value: "repairing", label: "در حال تعمیر" },
  { value: "done", label: "تعمیر شده" },
  { value: "delivered", label: "تحویل داده شده" },
];

export default function FilterPanel({
  filters,
  onChange,
  onClear,
  customers,
  personnel,
}) {
  const [open, setOpen] = useState(false);
  const [personnelDropdownOpen, setPersonnelDropdownOpen] = useState(false);
  const personnelRef = useRef(null);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

  useEffect(() => {
    function handleClickOutside(e) {
      if (personnelRef.current && !personnelRef.current.contains(e.target)) {
        setPersonnelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleStatus(value) {
    const current = filters.status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filters, status: updated });
  }

  function togglePersonnel(id) {
    const current = filters.personnel_ids || [];
    const updated = current.includes(id)
      ? current.filter((p) => p !== id)
      : [...current, id];
    onChange({ ...filters, personnel_ids: updated });
  }

  function getPersonnelLabel() {
    const selected = filters.personnel_ids || [];
    if (selected.length === 0) return "همه مسئولان";
    if (selected.length === 1) {
      const p = personnel.find((p) => p.id === selected[0]);
      return p?.name ?? p?.full_name ?? p?.username ?? "—";
    }
    return `${selected.length} مسئول انتخاب شده`;
  }

  return (
    <div className="my-4">
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

      {open && (
        <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

          <div ref={personnelRef} className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              مسئول
            </label>
            <button
              type="button"
              onClick={() => setPersonnelDropdownOpen((p) => !p)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-right flex justify-between items-center hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span
                className={
                  filters.personnel_ids?.length > 0
                    ? "text-gray-800"
                    : "text-gray-400"
                }
              >
                {getPersonnelLabel()}
              </span>
              <span className="text-gray-400 text-xs">
                {personnelDropdownOpen ? "▲" : "▼"}
              </span>
            </button>

            {personnelDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {personnel && personnel.length > 0 ? (
                  <>
                    {filters.personnel_ids?.length > 0 && (
                      <button
                        onClick={() => {
                          onChange({ ...filters, personnel_ids: [] });
                          setPersonnelDropdownOpen(false);
                        }}
                        className="w-full text-right px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100"
                      >
                        ✕ پاک کردن انتخاب‌ها
                      </button>
                    )}
                    {personnel.map((p) => {
                      const displayName =
                        p.name ?? p.full_name ?? p.username ?? "—";
                      const isSelected = filters.personnel_ids?.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePersonnel(p.id)}
                          className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                            isSelected
                              ? "bg-purple-50 text-purple-700"
                              : "text-gray-700"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0 ${
                              isSelected
                                ? "bg-purple-600 border-purple-600 text-white"
                                : "border-gray-300"
                            }`}
                          >
                            {isSelected && "✓"}
                          </span>
                          {displayName}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <p className="px-3 py-2 text-xs text-gray-400">
                    پرسنلی ثبت نشده
                  </p>
                )}
              </div>
            )}
          </div>

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
