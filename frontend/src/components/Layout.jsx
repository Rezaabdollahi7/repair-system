// src/components/Layout.jsx
import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Bars3Icon,
  HomeIcon,
  WrenchScrewdriverIcon,
  UsersIcon,
  UserGroupIcon,
  CubeIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  ChartPieIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/solid";

export default function Layout() {
  const location = useLocation();
  const { isAtLeast, user, logoutUser } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isActive = (path) => location.pathname.startsWith(path);

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  const menuItems = [
    {
      name: "داشبورد",
      path: "/dashboard",
      icon: HomeIcon,
      adminOnly: true,
    },
    {
      name: "دستگاه‌ها",
      path: "/devices",
      icon: WrenchScrewdriverIcon,
      adminOnly: false,
    },
    {
      name: "مشتریان",
      path: "/customers",
      icon: UsersIcon,
      adminOnly: false,
    },
    {
      name: "پرسنل",
      path: "/personnel",
      icon: UserGroupIcon,
      adminOnly: true,
    },
    {
      divider: true,
    },
    {
      name: "انبار و کالاها",
      path: "/items",
      icon: CubeIcon,
      adminOnly: true,
    },
    {
      name: "فاکتورهای خرید",
      path: "/purchase-invoices",
      icon: ShoppingCartIcon,
      adminOnly: true,
    },
    {
      name: "فاکتورهای فروش",
      path: "/sale-invoices",
      icon: CurrencyDollarIcon,
      adminOnly: true,
    },
    {
      name: "فاکتورهای تعمیر",
      path: "/repair-invoices",
      icon: WrenchScrewdriverIcon,
      adminOnly: true,
    },
    {
      divider: true,
    },
    {
      name: "گزارش موجودی",
      path: "/reports/stock",
      icon: ChartBarIcon,
      adminOnly: true,
    },
    {
      name: "گزارش سود و زیان",
      path: "/reports/profit",
      icon: ChartPieIcon,
      adminOnly: true,
    },
    {
      name: "پشتیبان‌گیری",
      path: "/backups",
      icon: ArchiveBoxIcon,
      adminOnly: true,
    },
    {
      divider: true,
    },
    {
      name: "تنظیمات",
      path: "/settings",
      icon: Cog6ToothIcon,
      adminOnly: true,
      superAdminOnly: true,
    },
  ];

  // First filter by role
  const filteredMenuItems = menuItems.filter(
    (item) => !item.adminOnly || (item.adminOnly && isAtLeast("admin")),
  );

  // Then remove leading/trailing dividers and consecutive dividers
  const cleanMenuItems = filteredMenuItems.filter((item, index, arr) => {
    if (!item.divider) return true; // Keep non-dividers

    // Remove divider if it's the first visible item
    if (index === 0) return false;

    // Remove divider if it's the last visible item
    if (index === arr.length - 1) return false;

    // Remove divider if the previous visible item is also a divider
    const prevItem = arr[index - 1];
    if (prevItem?.divider) return false;

    // Remove divider if the next visible item is also a divider
    const nextItem = arr[index + 1];
    if (nextItem?.divider) return false;

    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="rtl">
      {/* Sidebar - Fixed */}
      <aside
        className={`bg-white shadow-lg transition-all duration-300 flex flex-col fixed inset-y-0 right-0 z-30 ${
          sidebarOpen ? "w-64" : "w-20"
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 shrink-0">
          {sidebarOpen && (
            <h1 className="text-lg font-bold text-gray-900 truncate">
              سیستم مدیریت تعمیرات
            </h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {sidebarOpen ? (
              <ChevronRightIcon className="w-5 h-5 text-gray-600" />
            ) : (
              <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>

        {/* Navigation Menu - Scrollable */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {cleanMenuItems.map((item, index) => {
              if (item.divider) {
                return (
                  <li
                    key={`divider-${index}`}
                    className="my-3 border-t border-gray-200"
                  />
                );
              }

              const Icon = item.icon;
              const active = isActive(item.path);

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                    } ${!sidebarOpen && "justify-center"}`}
                    title={!sidebarOpen ? item.name : ""}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 ${active ? "text-blue-600" : "text-gray-400"}`}
                    />
                    {sidebarOpen && (
                      <span className="font-medium">{item.name}</span>
                    )}
                    {active && sidebarOpen && (
                      <span className="mr-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer - Role & Logout */}
        <div className="border-t border-gray-200 shrink-0">
          {/* User Info - Top */}
          <div className="p-4 border-b border-gray-200 shrink-0">
            <div
              className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <span className="text-blue-600 font-medium text-sm">
                  {user?.full_name?.charAt(0) ||
                    user?.username?.charAt(0) ||
                    "U"}
                </span>
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user?.full_name || user?.username}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Logout Button */}
          <div className="p-4 pt-0">
            <button
              onClick={handleLogout}
              className={`w-full flex items-center gap-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors ${
                !sidebarOpen && "justify-center"
              }`}
              title={!sidebarOpen ? "خروج" : ""}
            >
              <svg
                className="w-5 h-5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              {sidebarOpen && <span className="text-sm font-medium">خروج</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content - with margin for fixed sidebar */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          sidebarOpen ? "mr-64" : "mr-20"
        }`}
      >
        {/* Mobile Header */}
        <header className="bg-white shadow-sm lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <Bars3Icon className="w-6 h-6 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">
              سیستم مدیریت تعمیرات
            </h1>
            <div className="w-6" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
