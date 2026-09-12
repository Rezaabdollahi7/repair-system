import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { BreadcrumbProvider, type Crumb } from "../context/BreadcrumbContext";
import { useTheme } from "../context/ThemeContext";
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
  ChatBubbleLeftRightIcon,
  GiftIcon,
  ArrowRightStartOnRectangleIcon,
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/solid";
import { fadeInUp, spring, transition } from "../motion";
import { jalaliToday } from "../utils/jalali";
import { toPersianDigits } from "../utils/formatters";
import { roleStyleOf } from "../utils/roleStatus";
import StatusPill from "./StatusPill";

type IconComponent = React.ComponentType<{ className?: string }>;

interface MenuLink {
  name: string;
  path: string;
  icon: IconComponent;
  adminOnly: boolean;
}

/**
 * A titled group of links.
 *
 * The sidebar used to separate these with bare rules. The groups were
 * already there — the rules sat exactly on these boundaries — so this only
 * gives them the names they were implying.
 */
interface MenuSection {
  title: string;
  items: MenuLink[];
}

const MENU: MenuSection[] = [
  {
    title: "منوی اصلی",
    items: [
      { name: "داشبورد", path: "/dashboard", icon: HomeIcon, adminOnly: true },
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
    ],
  },
  {
    title: "انبار و فاکتورها",
    items: [
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
    ],
  },
  {
    title: "گزارش‌ها و حساب",
    items: [
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
      {
        name: "کیف پول پیامکی",
        path: "/sms-wallet",
        icon: ChatBubbleLeftRightIcon,
        adminOnly: true,
      },
      {
        name: "دعوت از دوستان",
        path: "/referral",
        icon: GiftIcon,
        adminOnly: true,
      },
    ],
  },
  /*
   * There is no «سیستم» section any more. It held one item — تنظیمات — and a
   * section heading over a single link costs a heading, a gap and a divider
   * to say what the link already says. Settings is a gear in the header now,
   * beside the theme switch, which is where an app's settings live.
   */
];

/**
 * Screens the nav does not list, by exact path. Keyed exactly rather than by
 * prefix: these are leaves, and a prefix match here would shadow a future
 * nav entry underneath the same path.
 *
 * `section` is optional because settings has none: it is reached from the
 * header rather than from a group of related pages, so a breadcrumb naming
 * a parent would be inventing one.
 */
const OFF_MENU: Record<string, { name: string; section?: string }> = {
  "/reports/transactions": {
    name: "تراکنش‌های انبار",
    section: "گزارش‌ها و حساب",
  },
  "/settings": { name: "تنظیمات" },
};

const COLLAPSE_KEY = "dofixo-sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/* ── Navigation ─────────────────────────────────────────────────────── */

interface NavProps {
  sections: MenuSection[];
  /** Longest matching path, so /reports/stock does not also light up /reports. */
  activePath: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
  /**
   * The desktop sidebar stays mounted behind `hidden lg:flex` while the
   * mobile drawer is open, so both would claim the same layoutId and the
   * indicator would fly between two sidebars. One prefix each keeps them
   * animating independently.
   */
  layoutPrefix: string;
}

function SidebarNav({
  sections,
  activePath,
  collapsed,
  onNavigate,
  layoutPrefix,
}: NavProps) {
  const reduceMotion = useReducedMotion();

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
      {sections.map((section) => (
        <div key={section.title} className="mb-5 last:mb-2">
          {/* The heading keeps its height when collapsed so the groups stay
              the same distance apart in both widths. */}
          <p
            className={`text-body-xs font-bold text-text-muted mb-2 h-4 transition-opacity duration-150 ${
              collapsed ? "opacity-0 px-0" : "opacity-100 px-2"
            }`}
            aria-hidden={collapsed}
          >
            {section.title}
          </p>

          <ul className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = activePath === item.path;

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.name : undefined}
                    className={`relative flex items-center gap-3 rounded-field p-1.5 transition-colors ${
                      collapsed ? "justify-center" : ""
                    } ${active ? "" : "hover:bg-surface-alt"}`}
                  >
                    {/*
                      The active pill is the brand.
                      -------------------------------------------------------
                      It was `bg-primary-soft`, and once the palette made
                      that an off-white the indicator all but vanished
                      against the sidebar's own white — the item was legible
                      only by its dark icon square, which is a weak signal for
                      the one thing a sidebar always has to say.

                      The accent is otherwise spent once per screen, and this
                      is that once: it is chrome rather than content, there is
                      exactly one active item, and "where am I" is the most
                      useful place in the app to put an unmissable colour.
                      With the blue that pill carries a white label rather
                      than a dark one — `text-accent-fg` follows the theme, so
                      nothing here had to change for it.
                    */}
                    {active && (
                      <motion.span
                        layoutId={`${layoutPrefix}-nav-active`}
                        transition={reduceMotion ? { duration: 0 } : spring}
                        className="absolute inset-0 rounded-field bg-accent"
                      />
                    )}

                    <span
                      className={`relative z-10 shrink-0 w-9 h-9 rounded-field flex items-center justify-center transition-colors ${
                        active
                          ? "bg-accent-fg/12 text-accent-fg"
                          : "bg-surface-alt text-text-secondary"
                      }`}
                    >
                      <Icon className="w-[1.15rem] h-[1.15rem]" />
                    </span>

                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={transition.fast}
                          className={`relative z-10 truncate text-body-sm ${
                            active
                              ? "font-bold text-accent-fg"
                              : "text-text-primary"
                          }`}
                        >
                          {item.name}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/* ── User menu ──────────────────────────────────────────────────────── */

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  // Closes on an outside click and on Escape. Without the first, the menu
  // stays open behind whatever the user clicked next.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial =
    user?.full_name?.charAt(0) || user?.username?.charAt(0) || "؟";

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 p-1 pl-2.5 rounded-pill border border-border
                   hover:bg-surface-alt transition-colors cursor-pointer"
      >
        <span
          className="w-8 h-8 rounded-full bg-primary-soft text-primary font-bold
                         flex items-center justify-center text-body-sm shrink-0"
        >
          {initial}
        </span>
        {/*
          The name only. The role used to sit under it in 12px grey, which
          made the button two lines tall in a 64px header and put a fact
          nobody checks twice where the eye lands most often. It is in the
          panel below now, next to the account it belongs to.
        */}
        <span className="hidden max-w-32 truncate text-body-sm font-bold text-text-primary sm:block">
          {user?.full_name || user?.username}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={transition.fast}
            className="absolute left-0 mt-2 w-56 origin-top-left z-50 rounded-card
                       bg-surface border border-border shadow-lg p-1.5"
          >
            <div className="mb-1.5 border-b border-border px-2.5 py-2.5">
              <p className="truncate text-body-sm font-bold text-text-primary">
                {user?.full_name || user?.username}
              </p>
              <p className="mt-0.5 text-body-xs text-text-secondary" dir="ltr">
                {toPersianDigits(user?.username ?? "")}
              </p>
              {/* The same pill the personnel table uses for a role, from the
                  same module — so a role looks like a role wherever it is
                  shown, rather than like a caption here and a badge there. */}
              {user?.role_label && (
                <div className="mt-2">
                  <StatusPill
                    label={user.role_label}
                    size="sm"
                    {...roleStyleOf(user.role)}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-field text-body-sm
                         text-danger-fg hover:bg-danger-soft transition-colors cursor-pointer"
            >
              <ArrowRightStartOnRectangleIcon className="w-[1.15rem] h-[1.15rem]" />
              خروج
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────── */

export default function Layout() {
  const location = useLocation();
  const { isAtLeast, logoutUser } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /*
   * What a detail page calls itself. `/customers/:id` is named after the
   * customer, which only the page knows; it publishes the name through
   * `usePageCrumb` and the header reads it here.
   */
  const [crumb, setCrumb] = useState<Crumb | null>(null);

  // Once per mount. See the note beside where it is rendered.
  const today = useMemo(() => jalaliToday(), []);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // Not remembering the width is not worth crashing the shell over.
    }
  }, [collapsed]);

  // No navigate() afterwards: logoutUser already routes to /login once the
  // server has been told, and navigating here raced it.
  const handleLogout = () => {
    void logoutUser();
  };

  const sections = useMemo(
    () =>
      MENU.map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.adminOnly || isAtLeast("admin"),
        ),
      }))
        // A section whose every link was admin-only would otherwise leave a
        // heading with nothing under it.
        .filter((section) => section.items.length > 0),
    [isAtLeast],
  );

  /**
   * Longest prefix wins. `/reports/stock` starts with `/reports`, and a
   * plain `startsWith` over the list would light whichever came first.
   */
  const active = useMemo(() => {
    let match: MenuLink | null = null;
    for (const section of sections) {
      for (const item of section.items) {
        if (
          location.pathname.startsWith(item.path) &&
          (!match || item.path.length > match.path.length)
        ) {
          match = item;
        }
      }
    }
    return match;
  }, [sections, location.pathname]);

  const activeSection =
    sections.find((section) => section.items.some((i) => i === active))
      ?.title ?? null;

  /**
   * Pages that are not in the sidebar still need a name in the header.
   *
   * There is one: the stock-movements report, reached from the dashboard's
   * «مشاهده همه» rather than the nav. With the pages' own <h1>s gone the
   * header is the only thing that names a screen, and this one would have
   * been titled «دوفیکسو» — the fallback for "no idea where we are".
   */
  const offMenu = OFF_MENU[location.pathname] ?? null;
  const onSettings = location.pathname.startsWith("/settings");
  /*
   * A page's own crumb wins over the nav's guess. `/customers/5` matches the
   * `/customers` nav entry by prefix, so without this the header would read
   * «مشتریان» on every customer's page.
   */
  const title = crumb?.name || active?.name || offMenu?.name || "دوفیکسو";
  const parent = crumb?.parent ?? null;
  const section = parent
    ? parent.name
    : (activeSection ?? offMenu?.section ?? null);

  const isDark = resolvedTheme === "dark";

  const brand = (
    <div className="flex items-center gap-2.5 min-w-0">
      <img
        src="/logo.webp"
        alt=""
        className="w-9 h-9 shrink-0 rounded-field bg-primary-soft p-1"
      />
      {/* The product's name, not a description of it. It read «مدیریت
          تعمیرات» — which is what the app does, printed where its name
          belongs, so the one place a shop would look to know what they had
          opened said nothing. */}
      <span className="font-bold text-text-primary truncate">دوفیکسو</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 right-0 z-30 bg-surface
                    border-l border-border transition-[width] duration-300 ease-[var(--ease-smooth)]
                    ${collapsed ? "w-[4.75rem]" : "w-64"}`}
      >
        <div
          className={`h-16 shrink-0 flex items-center gap-2 px-3 border-b border-border ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && brand}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "باز کردن منو" : "جمع کردن منو"}
            title={collapsed ? "باز کردن منو" : "جمع کردن منو"}
            className="p-2 rounded-field text-text-secondary hover:text-text-primary
                       hover:bg-surface-alt transition-colors cursor-pointer shrink-0"
          >
            {collapsed ? (
              <ChevronLeftIcon className="w-5 h-5" />
            ) : (
              <ChevronRightIcon className="w-5 h-5" />
            )}
          </button>
        </div>

        <SidebarNav
          sections={sections}
          activePath={active?.path ?? null}
          collapsed={collapsed}
          layoutPrefix="desktop"
        />
      </aside>

      {/* ── Mobile drawer ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition.fast}
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-scrim/50"
            />
            <motion.aside
              // x, not width: sliding a fixed panel moves one composited
              // layer, where animating width relays out its whole contents
              // on every frame.
              initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              transition={reduceMotion ? { duration: 0 } : spring}
              className="absolute inset-y-0 right-0 w-72 bg-surface shadow-xl flex flex-col"
            >
              <div className="h-16 shrink-0 flex items-center justify-between gap-2 px-3 border-b border-border">
                {brand}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="بستن منو"
                  className="p-2 rounded-field text-text-secondary hover:bg-surface-alt
                             transition-colors cursor-pointer shrink-0"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <SidebarNav
                sections={sections}
                activePath={active?.path ?? null}
                collapsed={false}
                onNavigate={() => setDrawerOpen(false)}
                layoutPrefix="mobile"
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div
        className={`transition-[padding] duration-300 ease-[var(--ease-smooth)] ${
          collapsed ? "lg:pr-[4.75rem]" : "lg:pr-64"
        }`}
      >
        {/*
          The desktop header is new. Every page used to open its own <h1>,
          which meant the title moved a little from page to page and there
          was nowhere to put anything that belongs to the shell.
        */}
        <header className="sticky top-0 z-20 h-16 bg-surface/85 backdrop-blur border-b border-border">
          <div className="relative h-full flex items-center gap-3 px-3 sm:px-5">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="باز کردن منو"
              className="lg:hidden p-2 rounded-field text-text-secondary hover:bg-surface-alt
                         transition-colors cursor-pointer shrink-0"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>

            {/*
              The page's title, and the only one.
              ---------------------------------------------------------------
              Every page used to print its own <h1> and a line of blurb under
              it, which said what this says — with the sidebar's highlighted
              item saying it a third time. So this is now the heading itself
              rather than a muted breadcrumb beside a heading, at title size,
              with the section it belongs to ahead of it.

              It is an <h1>: there is exactly one per screen again, and it
              lives in the shell because the shell is the thing that knows
              which page is open.
            */}
            {/* Capped on desktop so a long name cannot run under the
                centred date; below md the date is hidden and it may have the
                whole row. */}
            <nav aria-label="مسیر" className="min-w-0 flex-1 md:max-w-[32%]">
              <h1 className="text-title-sm text-text-secondary truncate sm:text-title-md">
                {section && (
                  /* A menu section is decoration and can be dropped on a
                     phone. A parent handed up by a detail page is the way
                     back to its list, and a phone is exactly where that
                     matters, so that one stays. */
                  <span
                    className={`text-body-sm text-text-muted ${
                      parent ? "inline" : "hidden sm:inline"
                    }`}
                  >
                    {/* A menu section is a heading and goes nowhere; a
                        parent handed up by a detail page is the way back to
                        its list, so that one is a link. */}
                    {parent ? (
                      <Link
                        to={parent.path}
                        className="rounded-field hover:text-text-secondary
                                   hover:underline focus-visible:outline-none
                                   focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        {section}
                      </Link>
                    ) : (
                      section
                    )}
                    <span className="mx-1.5" aria-hidden="true">
                      ›
                    </span>
                  </span>
                )}
                <span className="font-bold text-text-primary">{title}</span>
              </h1>
            </nav>

            {/*
              Today's date, centred in the header.
              ---------------------------------------------------------------
              Absolutely positioned rather than a third flex child: the title
              on one side and the controls on the other are different widths
              on every page, so a flex-centred item would drift left and right
              as you navigated. This stays put.

              `pointer-events-none` because it sits over the row — without it
              the invisible box would swallow clicks meant for the title or
              the theme button. Hidden below md, where there is no room for it
              between the two.

              Computed once per mount, not on a timer. A shop that leaves the
              tab open past midnight sees yesterday until it next navigates,
              which is a smaller lie than a clock that repaints the header
              every second to be right about a date that changes once a day.
            */}
            <div
              className="pointer-events-none absolute inset-0 hidden items-center
                         justify-center md:flex"
            >
              <p className="text-body-sm font-bold text-text-secondary">
                {today}
              </p>
            </div>

            {/*
              `ms-auto` pins these to the far end of the row.
              ---------------------------------------------------------------
              Without it they sit immediately after the title, which is
              capped — so the free space fell to the *outside* of them and
              they came to rest near the middle of the header, directly under
              the centred date. The two overlapped and the date was
              unreadable.
            */}
            <div className="ms-auto flex items-center gap-1 shrink-0">
              {/*
                Settings, where the sidebar's «سیستم» section used to be.
                ------------------------------------------------------------
                A link rather than a button, so it can be middle-clicked and
                so `aria-current` can say when you are already on it — which
                also gives it the only resting background of the three
                controls, since a gear that looks the same on and off the
                page it opens is a control that never tells you anything.
              */}
              <Link
                to="/settings"
                aria-label="تنظیمات"
                title="تنظیمات"
                aria-current={onSettings ? "page" : undefined}
                className={`p-2.5 rounded-field transition-colors cursor-pointer shrink-0 ${
                  onSettings
                    ? "bg-accent-soft text-accent-text"
                    : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                }`}
              >
                <Cog6ToothIcon className="w-5 h-5" />
              </Link>

              <button
                type="button"
                onClick={toggleTheme}
                aria-label={isDark ? "روشن کردن پوسته" : "تیره کردن پوسته"}
                title={isDark ? "پوستهٔ روشن" : "پوستهٔ تیره"}
                className="p-2.5 rounded-field text-text-secondary hover:text-text-primary
                           hover:bg-surface-alt transition-colors cursor-pointer shrink-0"
              >
                <motion.span
                  key={resolvedTheme}
                  initial={reduceMotion ? false : { rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  transition={transition.base}
                  className="block"
                >
                  {isDark ? (
                    <SunIcon className="w-5 h-5" />
                  ) : (
                    <MoonIcon className="w-5 h-5" />
                  )}
                </motion.span>
              </button>

              <UserMenu onLogout={handleLogout} />
            </div>
          </div>
        </header>

        {/*
          overflow-x-auto, so a table wider than the phone scrolls inside the
          page area instead of widening the document. Without it the whole
          document overflows, and in RTL that shifts the fixed drawer off the
          screen edge by however much the table overhangs.

          On <main> rather than an ancestor: giving the header's parent an
          overflow would make it the scroll container and the sticky header
          would stop sticking.
        */}
        <main className="p-3 sm:p-4 lg:p-6 overflow-x-auto">
          <SubscriptionBanner />
          {/*
            Keyed on the path so each route plays the entrance once. No
            AnimatePresence: `mode="wait"` would hold the old page on screen
            for the length of its exit before the new one starts, which on a
            data-heavy list reads as the app hesitating.
          */}
          <motion.div
            key={location.pathname}
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            <BreadcrumbProvider value={{ crumb, setCrumb }}>
              <Outlet />
            </BreadcrumbProvider>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
