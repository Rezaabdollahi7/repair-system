import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BuildingStorefrontIcon,
  DevicePhoneMobileIcon,
  LockClosedIcon,
  TicketIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { register, sendOtp } from "../api";
import { errorText } from "../utils/errors";
import OtpCodeStep from "../components/OtpCodeStep";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthSubmit from "../components/AuthSubmit";
import { slideFromEnd } from "../motion";

interface RegisterForm {
  workspace_name: string;
  username: string;
  password: string;
  referral_code: string;
}

export default function Register() {
  const { loginUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduceMotion = useReducedMotion();

  const [form, setForm] = useState<RegisterForm>({
    workspace_name: "",
    username: "",
    password: "",
    // Prefilled from the invite link, so someone who followed one does not
    // have to notice the field at all. Still editable: a code read over the
    // phone is typed here instead.
    referral_code: (params.get("ref") ?? "").toUpperCase(),
  });
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * When the code was sent, and null until it has been.
   *
   * Doubles as which step is showing, rather than a separate flag that could
   * disagree with it. Nothing is kept on the server between the two calls —
   * the form lives here, and the code itself is the proof, so a reload starts
   * over rather than resuming something half-made.
   */
  const [sentAt, setSentAt] = useState<number | null>(null);

  /** Step one: the form is complete, ask for a code. */
  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendOtp({ phone: form.username, purpose: "register" });
      setSentAt(Date.now());
      toast.success("کد تأیید فرستاده شد");
    } catch (err) {
      // A number already registered is refused here rather than at the end,
      // so nobody fills in a form and pays for a message before finding out.
      toast.error(errorText(err, "خطا در ارسال کد"));
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setLoading(true);
    try {
      await sendOtp({ phone: form.username, purpose: "register" });
      // Restarts the countdown, and the server has just invalidated whatever
      // came before — so the old code in the user's messages is dead.
      setSentAt(Date.now());
      setCode("");
      toast.success("کد تازه فرستاده شد");
    } catch (err) {
      toast.error(errorText(err, "خطا در ارسال کد"));
    } finally {
      setLoading(false);
    }
  };

  /** Step two: the code and the form go up together, in one request. */
  const submitRegistration = async () => {
    setLoading(true);
    try {
      const res = await register({
        ...form,
        code,
        // Omitted rather than sent empty, so the server sees "no code" rather
        // than an empty string it has to interpret.
        referral_code: form.referral_code.trim() || undefined,
      });

      // A code that was typed and not recognised is worth saying. It does not
      // fail the registration — turning someone away at the last step over
      // one mistyped character costs a customer — but silently ignoring it
      // would leave them expecting a discount that never arrives.
      if (form.referral_code.trim() && !res.data.referral_applied) {
        toast.error("کد دعوت شناسایی نشد. ثبت‌نام بدون تخفیف انجام شد");
      }
      // Signed in straight away: the credentials were just chosen, so asking
      // for them again would be asking twice for nothing.
      loginUser(res.data.token, res.data.user);
      toast.success("کارگاه شما ساخته شد. خوش آمدید!");
      navigate("/devices", { replace: true });
    } catch (err) {
      toast.error(errorText(err, "خطا در ثبت‌نام"));
    } finally {
      setLoading(false);
    }
  };

  // Shared by the text inputs, which differ only in their validation
  // attributes, icon and placeholder.
  const field = (key: keyof RegisterForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value }),
  });

  const onCodeStep = sentAt !== null;

  return (
    <AuthLayout
      title={onCodeStep ? "تأیید شماره" : "ساخت کارگاه جدید"}
      subtitle={
        onCodeStep
          ? "آخرین قدم — شماره‌تان را تأیید کنید"
          : "یک ماه رایگان، بدون محدودیت امکانات"
      }
      footer={
        <>
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            ورود
          </Link>
        </>
      }
    >
      {/* Two segments rather than a "step 1 of 2" caption: the filled half
          says how far along the user is without being read. */}
      <div className="flex gap-1.5 mb-6" aria-hidden>
        <span className="h-1 flex-1 rounded-pill bg-primary" />
        <span className="h-1 flex-1 rounded-pill bg-surface-alt overflow-hidden">
          {/* scaleX from the right edge, because the page reads right to left */}
          <motion.span
            className="block h-full rounded-pill bg-primary origin-right"
            initial={false}
            animate={{ scaleX: onCodeStep ? 1 : 0 }}
            transition={reduceMotion ? { duration: 0 } : undefined}
          />
        </span>
      </div>

      {/*
        mode="wait" so the outgoing step finishes leaving before the next
        arrives — the two have different heights, and crossfading them makes
        the card jump.
      */}
      <AnimatePresence mode="wait" initial={false}>
        {!onCodeStep ? (
          <motion.form
            key="details"
            onSubmit={requestCode}
            className="space-y-4"
            variants={slideFromEnd}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <AuthField
              label="نام کارگاه"
              required
              minLength={2}
              maxLength={100}
              icon={BuildingStorefrontIcon}
              placeholder="تعمیرگاه رضا"
              {...field("workspace_name")}
            />

            <AuthField
              label="شماره موبایل"
              type="tel"
              required
              autoComplete="tel"
              icon={DevicePhoneMobileIcon}
              placeholder="09123456789"
              dir="ltr"
              hint="کد تأیید به این شماره فرستاده می‌شود و با همین شماره وارد می‌شوید"
              {...field("username")}
            />

            <AuthField
              label="رمز عبور"
              type="password"
              required
              autoComplete="new-password"
              icon={LockClosedIcon}
              // Matches the server's rule rather than guessing at a stricter
              // one: a form that rejects what the API would accept is its own
              // kind of bug.
              minLength={8}
              dir="ltr"
              placeholder="••••••••"
              hint="حداقل ۸ کاراکتر"
              {...field("password")}
            />

            <AuthField
              label="کد دعوت"
              optional
              maxLength={32}
              icon={TicketIcon}
              placeholder="ABC234"
              dir="ltr"
              hint="اگر کسی شما را دعوت کرده، ۱۰٪ تخفیف روی اولین خرید می‌گیرید"
              value={form.referral_code}
              onChange={(event) =>
                setForm({
                  ...form,
                  // Upper-cased here as well as on the server: the codes are
                  // printed in capitals and someone typing lowercase should
                  // see it match what they were given.
                  referral_code: event.target.value.toUpperCase(),
                })
              }
            />

            <AuthSubmit loading={loading} className="!mt-6">
              {loading ? "در حال ارسال کد" : "ادامه"}
            </AuthSubmit>
          </motion.form>
        ) : (
          <motion.div
            key="code"
            variants={slideFromEnd}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <OtpCodeStep
              phone={form.username}
              code={code}
              onCodeChange={setCode}
              onSubmit={submitRegistration}
              onResend={resendCode}
              // The form is still in state, so going back shows it filled in
              // rather than empty — the number is usually what needs fixing.
              onBack={() => {
                setSentAt(null);
                setCode("");
              }}
              loading={loading}
              sentAt={sentAt}
              submitLabel="ساخت کارگاه"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
