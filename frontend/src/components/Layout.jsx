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
  CogIcon,
  PlusIcon,
  XMarkIcon,
  ArchiveBoxIcon,
} from "@heroicons/react/24/solid";
import { useModal } from "../context/ModalContext";

export default function Layout() {
  const location = useLocation();
  const { isAtLeast, user, logoutUser } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isActive = (path) => location.pathname.startsWith(path);

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  const menuItems = [
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
      name: "پشتیبان‌گیری",
      path: "/backups",
      icon: ArchiveBoxIcon,
      adminOnly: true,
    },
    { divider: true },
    {
      name: "تنظیمات",
      path: "/settings",
      icon: Cog6ToothIcon,
      superAdminOnly: true,
    },
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (item.divider) return true;
    if (item.superAdminOnly) return user?.role === "super_admin";
    if (item.adminOnly) return isAtLeast("admin");
    return true;
  });

  const cleanMenuItems = filteredMenuItems.filter((item, index, arr) => {
    if (!item.divider) return true;
    if (index === 0) return false;
    if (index === arr.length - 1) return false;
    const prevItem = arr[index - 1];
    if (prevItem?.divider) return false;
    const nextItem = arr[index + 1];
    if (nextItem?.divider) return false;
    return true;
  });

  function FloatingActionButton() {
    const [isOpen, setIsOpen] = useState(false);
    const {
      openPurchaseInvoiceCreate,
      openSaleInvoiceCreate,
      openRepairInvoiceCreate,
      openDeviceEdit,
      openCustomerEdit,
      openItemEdit,
    } = useModal();

    const actions = [
      {
        label: "فاکتور خرید",
        icon: ShoppingCartIcon,
        color: "bg-orange-500 hover:bg-orange-600",
        onClick: () => openPurchaseInvoiceCreate(),
      },
      {
        label: "فاکتور فروش",
        icon: CurrencyDollarIcon,
        color: "bg-green-500 hover:bg-green-600",
        onClick: () => openSaleInvoiceCreate(),
      },
      {
        label: "فاکتور تعمیر",
        icon: WrenchScrewdriverIcon,
        color: "bg-blue-500 hover:bg-blue-600",
        onClick: () => openRepairInvoiceCreate(),
      },
      {
        label: "دستگاه جدید",
        icon: CogIcon,
        color: "bg-purple-500 hover:bg-purple-600",
        onClick: () => openDeviceEdit(null),
      },
      {
        label: "مشتری جدید",
        icon: HomeIcon,
        color: "bg-pink-500 hover:bg-pink-600",
        onClick: () => openCustomerEdit(null),
      },
      {
        label: "کالای جدید",
        icon: CubeIcon,
        color: "bg-teal-500 hover:bg-teal-600",
        onClick: () => openItemEdit(null),
      },
    ];

    return (
      <div className="fixed bottom-4 left-1 sm:bottom-14 sm:left-10 z-40 flex flex-col items-center gap-3 hidden">
        {isOpen && (
          <div
            className="fixed inset-0 -z-30"
            onClick={() => setIsOpen(false)}
          />
        )}
        <div className="flex flex-col-reverse items-center gap-2 sm:gap-3">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick();
                setIsOpen(false);
              }}
              className={`flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 rounded-full text-white shadow-lg transition-all duration-300 ${action.color} ${
                isOpen
                  ? "opacity-100 translate-y-0 scale-100"
                  : "opacity-0 translate-y-4 scale-75 pointer-events-none"
              }`}
              style={{ transitionDelay: isOpen ? `${index * 50}ms` : "0ms" }}
              title={action.label}
            >
              <action.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                {action.label}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`p-3 sm:p-4 rounded-full shadow-2xl text-white transition-all duration-300 z-40 ${
            isOpen
              ? "bg-red-500 hover:bg-red-600 rotate-45"
              : "bg-blue-600 hover:bg-blue-700 rotate-0"
          }`}
        >
          {isOpen ? (
            <XMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          ) : (
            <PlusIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Desktop Sidebar */}
      <aside
        className={`bg-white shadow-lg transition-all duration-300 flex-col fixed inset-y-0 right-0 z-30 hidden lg:flex ${sidebarOpen ? "w-64" : "w-20"}`}
      >
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
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className=" px-2">
            {cleanMenuItems.map((item, index) => {
              if (item.divider)
                return (
                  <li
                    key={`divider-${index}`}
                    className="my-2 border-t border-gray-200"
                  />
                );
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
        <div className="border-t border-gray-200 shrink-0">
          <div className="p-2 border-b border-gray-200 shrink-0">
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
          <div className="p-4 pt-0">
            <button
              onClick={handleLogout}
              className={`w-full flex pt-2 gap-3 px-3  text-red-600 hover:bg-red-50 rounded-lg transition-colors ${!sidebarOpen && "justify-center"}`}
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
          <aside className="absolute inset-y-0 right-0 w-64 bg-white shadow-xl flex flex-col z-50">
            <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 shrink-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                سیستم مدیریت تعمیرات
              </h1>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <nav className="flex-1 py-4 overflow-y-auto">
              <ul className="space-y-1 px-2">
                {cleanMenuItems.map((item, index) => {
                  if (item.divider)
                    return (
                      <li
                        key={`divider-${index}`}
                        className="my-3 border-t border-gray-200"
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
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <Icon
                          className={`w-5 h-5 shrink-0 ${active ? "text-blue-600" : "text-gray-400"}`}
                        />
                        <span className="font-medium">{item.name}</span>
                        {active && (
                          <span className="mr-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-gray-200 shrink-0">
              <div className="p-4 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-blue-600 font-medium text-sm">
                      {user?.full_name?.charAt(0) ||
                        user?.username?.charAt(0) ||
                        "U"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user?.full_name || user?.username}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 pt-0">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 mt-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                  <span className="text-sm font-medium ">خروج</span>
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
        <header className="bg-white shadow-sm lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
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
        <main className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-auto">
          <Outlet />
          {isAtLeast("admin") && <FloatingActionButton />}
        </main>
      </div>
    </div>
  );
}
