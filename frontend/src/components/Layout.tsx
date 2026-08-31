import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import HomeIcon from "./icons/HomeIcon";
import SubscriptionBanner from "./SubscriptionBanner";
import {
  Bars3Icon,
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
  XMarkIcon,
  ArrowDownTrayIcon,
  CreditCardIcon,
} from "@heroicons/react/24/solid";

type IconComponent = React.ComponentType<{ className?: string }>;

/** A divider carries nothing but its own kind. */
interface MenuDivider {
  divider: true;
}

interface MenuLink {
  divider?: false;
  name: string;
  path: string;
  icon: IconComponent;
  adminOnly: boolean;
}

type MenuEntry = MenuDivider | MenuLink;

export default function Layout() {
  const location = useLocation();
  const { isAtLeast, user, logoutUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isActive = (path: string) => location.pathname.startsWith(path);

  // No navigate() afterwards: logoutUser already routes to /login once the
  // server has been told, and navigating here raced it.
  const handleLogout = () => {
    void logoutUser();
  };

  const menuItems: MenuEntry[] = [
    { name: "داشبورد", path: "/dashboard", icon: HomeIcon, adminOnly: true },
    {
      name: "دستگاه‌ها",
      path: "/devices",
      icon: WrenchScrewdriverIcon,
      adminOnly: false,
    },
    { name: "مشتریان", path: "/customers", icon: UsersIcon, adminOnly: false },
    { name: "پرسنل", path: "/personnel", icon: UserGroupIcon, adminOnly: true },
    { divider: true },
    { name: "انبار و کالاها", path: "/items", icon: CubeIcon, adminOnly: true },
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
    { divider: true },
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
      name: "خروجی اطلاعات",
      path: "/exports",
      icon: ArrowDownTrayIcon,
      adminOnly: true,
    },
    {
      name: "اشتراک",
      path: "/subscription",
      icon: CreditCardIcon,
      adminOnly: true,
    },
    { divider: true },
    {
      name: "تنظیمات",
      path: "/settings",
      icon: Cog6ToothIcon,
      adminOnly: false,
    },
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (item.divider) return true;
    if (item.adminOnly) return isAtLeast("admin");
    return true;
  });

  // Drops a divider that ended up leading, trailing, or beside another one
  // after the role filter removed what sat between them.
  const cleanMenuItems = filteredMenuItems.filter((item, index, arr) => {
    if (!item.divider) return true;
    if (index === 0) return false;
    if (index === arr.length - 1) return false;
    if (arr[index - 1]?.divider) return false;
    if (arr[index + 1]?.divider) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-bg" dir="rtl">
      {/* Desktop Sidebar */}
      <aside
        className={`bg-surface h-[97%] my-auto rounded-3xl shadow-lg transition-all duration-300 flex-col fixed inset-y-0 right-3 z-30 hidden lg:flex ${sidebarOpen ? "w-64" : "w-20"}`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
          {sidebarOpen && (
            <h1 className="text-lg font-bold text-text-primary truncate">
              سیستم مدیریت تعمیرات
            </h1>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
          >
            {sidebarOpen ? (
              <ChevronRightIcon className="w-5 h-5 text-text-primary" />
            ) : (
              <ChevronLeftIcon className="w-5 h-5 text-text-primary" />
            )}
          </button>
        </div>
        <nav className="flex-1 pt-2 overflow-y-auto">
          <ul className="px-2">
            {cleanMenuItems.map((item, index) => {
              if (item.divider)
                return (
                  <li
                    key={`divider-${index}`}
                    className="my-2 border-t border-border"
                  />
                );
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-3xl transition-colors ${
                      active
                        ? "bg-primary-soft text-text-primary"
                        : "text-text-primary hover:bg-surface-alt"
                    } ${!sidebarOpen && "justify-center"}`}
                    title={!sidebarOpen ? item.name : ""}
                  >
                    <Icon
                      className={`w-5 h-5 shrink-0 ${active ? "text-primary" : "text-text-secondary"}`}
                    />
                    {sidebarOpen && <span>{item.name}</span>}
                    {active && sidebarOpen && (
                      <span className="mr-auto size-2 rounded-full bg-primary" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-border shrink-0">
          <div className="p-2 border-b border-border shrink-0">
            <div
              className={`flex items-center ${sidebarOpen ? "gap-3" : "justify-center"}`}
            >
              <div className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                <span className="text-primary font-medium text-sm">
                  {user?.full_name?.charAt(0) ||
                    user?.username?.charAt(0) ||
                    "U"}
                </span>
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {user?.full_name || user?.username}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 pt-0">
            <button
              onClick={handleLogout}
              className={`w-full flex pt-2 gap-3 px-3 text-danger hover:bg-danger-soft rounded-lg transition-colors ${!sidebarOpen && "justify-center"}`}
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

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 w-64 bg-surface shadow-xl flex flex-col z-50">
            <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
              <h1 className="text-lg font-bold text-text-primary truncate">
                سیستم مدیریت تعمیرات
              </h1>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2 rounded-lg hover:bg-surface-alt transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-text-primary" />
              </button>
            </div>
            <nav className="flex-1 py-4 overflow-y-auto">
              <ul className="space-y-1 px-2">
                {cleanMenuItems.map((item, index) => {
                  if (item.divider)
                    return (
                      <li
                        key={`divider-${index}`}
                        className="my-3 border-t border-border"
                      />
                    );
                  const Icon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <li key={item.path}>
                      <Link
                        to={item.path}
                        onClick={() => setMobileSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          active
                            ? "bg-primary-soft text-primary"
                            : "text-text-primary hover:bg-surface-alt"
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 shrink-0 ${active ? "text-primary" : "text-text-secondary"}`}
                        />
                        <span className="font-medium">{item.name}</span>
                        {active && (
                          <span className="mr-auto w-1.5 h-1.5 rounded-full bg-primary" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-border shrink-0">
              <div className="p-4 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                    <span className="text-primary font-medium text-sm">
                      {user?.full_name?.charAt(0) ||
                        user?.username?.charAt(0) ||
                        "U"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {user?.full_name || user?.username}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 pt-0">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 mt-2 text-danger hover:bg-danger-soft rounded-lg transition-colors"
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
                  <span className="text-sm font-medium">خروج</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div
        className={`transition-all duration-300 ${sidebarOpen ? "lg:mr-64" : "lg:mr-20"}`}
      >
        <header className="bg-surface shadow-sm lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-surface-alt"
            >
              <Bars3Icon className="w-6 h-6 text-text-secondary" />
            </button>
            <h1 className="text-lg font-bold text-text-primary">
              سیستم مدیریت تعمیرات
            </h1>
            <div className="w-6" />
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-auto">
          <SubscriptionBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
