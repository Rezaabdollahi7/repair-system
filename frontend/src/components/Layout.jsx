import { Outlet, Link, useLocation } from "react-router-dom";

export default function Layout() {
  const location = useLocation();

  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <Link
                to="/"
                className="flex items-center text-xl font-bold text-gray-900"
              >
                سیستم مدیریت تعمیرات
              </Link>
              <Link
                to="/devices"
                className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${
                  isActive("/devices")
                    ? "border-blue-500 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                دستگاه‌ها
              </Link>
              <Link
                to="/customers"
                className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${
                  isActive("/customers")
                    ? "border-blue-500 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                مشتریان
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
