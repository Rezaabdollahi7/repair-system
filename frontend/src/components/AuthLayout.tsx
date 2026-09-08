import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  WrenchScrewdriverIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  SunIcon,
  MoonIcon,
} from "@heroicons/react/24/solid";
import { useTheme } from "../context/ThemeContext";
import { fadeInUp, staggerContainer, staggerItem, transition } from "../motion";

/**
 * The shell behind login, sign-up and password reset.
 *
 * Those three pages were each a centred card on an empty background, which
 * left the first screen of the product saying nothing about it. The brand
 * panel is the half that does the selling; the form keeps its own column so
 * nothing about filling it in changes.
 *
 * The guideline puts the form at the reading-start edge and the panel at the
 * far one. It is drawn left-to-right, so the mirror of it — not a copy — is
 * what belongs here: form on the right, panel on the left.
 *
 * Below `lg` the panel is dropped rather than stacked. A marketing column
 * above a sign-up form is something a phone user scrolls past.
 */

const SELLING_POINTS = [
  {
    icon: WrenchScrewdriverIcon,
    title: "پیگیری دستگاه‌ها",
    body: "از پذیرش تا تحویل، وضعیت هر دستگاه روشن است",
  },
  {
    icon: ChartBarIcon,
    title: "گزارش سود و زیان",
    body: "بدانید کدام کار برایتان می‌ارزد و کدام نه",
  },
  {
    icon: ShieldCheckIcon,
    title: "اطلاعات کارگاه شما، فقط مال شما",
    body: "هر کارگاه در فضای جدا، با پشتیبان‌گیری رمزنگاری‌شده",
  },
];

interface Props {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** The "already have an account?" line under the form. */
  footer?: ReactNode;
}

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: Props) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[minmax(0,1fr)_1.15fr]">
      {/* ── Form column (reading start) ─────────────────────────────── */}
      <main className="relative flex flex-col px-5 py-8 sm:px-10 lg:py-10">
        <div className="flex items-center justify-between w-full max-w-[27rem] mx-auto">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.webp"
              alt=""
              className="w-9 h-9 rounded-field bg-primary-soft p-1"
            />
            <span className="font-bold text-text-primary">
              سیستم مدیریت تعمیرات
            </span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "روشن کردن پوسته" : "تیره کردن پوسته"}
            title={isDark ? "پوستهٔ روشن" : "پوستهٔ تیره"}
            className="p-2.5 rounded-field text-text-secondary hover:text-text-primary
                       hover:bg-surface-alt transition-colors cursor-pointer"
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
        </div>

        <motion.div
          className="w-full max-w-[27rem] mx-auto my-auto py-12"
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
        >
          <header className="mb-7">
            <h1 className="text-display-sm font-bold text-text-primary">
              {title}
            </h1>
            {subtitle && (
              <p className="text-body-sm text-text-secondary mt-2">
                {subtitle}
              </p>
            )}
          </header>

          {children}

          {footer && (
            <p className="text-body-sm text-center text-text-secondary mt-7">
              {footer}
            </p>
          )}
        </motion.div>
      </main>

      {/* ── Brand panel ─────────────────────────────────────────────── */}
      <aside
        className="relative hidden lg:flex flex-col justify-center gap-16 overflow-hidden
                   rounded-panel m-4 p-12 text-on-dark"
        style={{ backgroundImage: "var(--brand-panel)" }}
      >
        {/*
          Two blurred blobs instead of a flat fill. They are decorative and
          aria-hidden; at this blur radius they read as light on a surface
          rather than as shapes, which is what keeps the panel from looking
          like a coloured rectangle.
        */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute -top-32 -right-20 w-[28rem] h-[28rem] rounded-full bg-on-dark/12 blur-3xl"
            animate={reduceMotion ? undefined : { scale: [1, 1.12, 1] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-40 -left-24 w-[32rem] h-[32rem] rounded-full bg-scrim/25 blur-3xl"
            animate={reduceMotion ? undefined : { scale: [1, 1.08, 1] }}
            transition={{
              duration: 18,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
          />
        </div>

        <motion.div
          className="relative text-center"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.h2
            variants={staggerItem}
            className="text-headline-md font-bold max-w-lg mx-auto"
          >
            کارگاه‌تان را از روی دفتر بردارید و بگذارید روی صفحه
          </motion.h2>
          <motion.p
            variants={staggerItem}
            className="text-body-sm text-on-dark/70 mt-4 max-w-md mx-auto"
          >
            «دستگاه‌ها، مشتریان، انبار و فاکتورها — یک‌جا، قابل جست‌وجو، و همیشه
            در دسترس»
          </motion.p>
        </motion.div>

        <motion.ul
          className="relative space-y-6 max-w-md mx-auto w-full"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          {SELLING_POINTS.map(({ icon: Icon, title: heading, body }) => (
            <motion.li
              key={heading}
              variants={staggerItem}
              className="flex gap-4 items-start"
            >
              <span className="shrink-0 w-10 h-10 rounded-field bg-on-dark/15 flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </span>
              <span>
                <span className="block font-bold">{heading}</span>
                <span className="block text-body-sm text-on-dark/70">
                  {body}
                </span>
              </span>
            </motion.li>
          ))}
        </motion.ul>

        <motion.p
          className="absolute bottom-12 inset-x-12 text-body-sm text-on-dark/60 text-center"
          initial="hidden"
          animate="visible"
          variants={fadeInUp}
        >
          یک ماه رایگان — بدون کارت بانکی، بدون محدودیت امکانات
        </motion.p>
      </aside>
    </div>
  );
}
