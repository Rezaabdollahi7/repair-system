import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const location = useLocation();
  const { isAtLeast, user, logoutUser } = useAuth();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname.startsWith(path);

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

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
                className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${isActive("/devices") ? "border-blue-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
              >
                دستگاه‌ها
              </Link>
              <Link
                to="/customers"
                className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${isActive("/customers") ? "border-blue-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
              >
                مشتریان
              </Link>

              {isAtLeast("admin") && (
                <>
                  <Link
                    to="/personnel"
                    className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${isActive("/personnel") ? "border-blue-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
                  >
                    پرسنل
                  </Link>
                  <Link
                    to="/items"
                    className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${isActive("/items") ? "border-blue-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
                  >
                    انبار و کالاها
                  </Link>
                  <Link
                    to="/purchase-invoices"
                    className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${isActive("/purchase-invoices") ? "border-blue-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
                  >
                    فاکتورهای خرید
                  </Link>

                  <Link
                    to="/sale-invoices"
                    className={`inline-flex items-center px-3 border-b-2 text-sm font-medium ${isActive("/sale-invoices") ? "border-blue-500 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`}
                  >
                    فاکتورهای فروش
                  </Link>
                </>
              )}
            </div>

            {/* user info + logout */}
            <div className="flex items-center gap-3" dir="rtl">
              <span className="text-sm text-gray-600">
                {user?.full_name ?? user?.username}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1 rounded-lg transition-colors cursor-pointer"
              >
                خروج
              </button>
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
