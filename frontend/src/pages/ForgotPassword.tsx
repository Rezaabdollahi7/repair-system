import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  DevicePhoneMobileIcon,
  LockClosedIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { resetPassword, sendOtp } from "../api";
import { errorText } from "../utils/errors";
import OtpCodeStep from "../components/OtpCodeStep";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthSubmit from "../components/AuthSubmit";
import { slideFromEnd } from "../motion";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendOtp({ phone, purpose: "reset" });
      setSentAt(Date.now());
      // Says the code was sent whether or not the number has an account: the
      // server answers the same way either way, so that no one can use this
      // page to text arbitrary numbers at the workshop's expense.
      toast.success("اگر این شماره حساب داشته باشد، کد فرستاده شد");
    } catch (err) {
      toast.error(errorText(err, "خطا در ارسال کد"));
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setLoading(true);
    try {
      await sendOtp({ phone, purpose: "reset" });
      setSentAt(Date.now());
      setCode("");
      toast.success("کد تازه فرستاده شد");
    } catch (err) {
      toast.error(errorText(err, "خطا در ارسال کد"));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    setLoading(true);
    try {
      await resetPassword({ phone, code, new_password: newPassword });
      // To the login form, not signed in. Every session that account had was
      // just ended — opening a new one here would undo half of the point,
      // and typing the password once proves it was remembered.
      toast.success("رمز عبور تغییر کرد. با رمز تازه وارد شوید");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(errorText(err, "خطا در تغییر رمز"));
    } finally {
      setLoading(false);
    }
  };

  const onCodeStep = sentAt !== null;

  return (
    <AuthLayout
      title={onCodeStep ? "تأیید شماره" : "فراموشی رمز عبور"}
      subtitle={
        onCodeStep
          ? "کد را وارد کنید تا رمز تازه ثبت شود"
          : "با شماره‌ی موبایلتان رمز تازه بسازید"
      }
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          بازگشت به ورود
        </Link>
      }
    >
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
              label="شماره موبایل"
              type="tel"
              required
              autoComplete="tel"
              icon={DevicePhoneMobileIcon}
              placeholder="09123456789"
              dir="ltr"
              hint="همان شماره‌ای که با آن وارد می‌شوید"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            {/* Chosen before the code, like sign-up: the code is spent in the
                same request that sets it, so there is nothing held on the
                server in between. */}
            <AuthField
              label="رمز عبور تازه"
              type="password"
              required
              autoComplete="new-password"
              icon={LockClosedIcon}
              minLength={8}
              dir="ltr"
              placeholder="••••••••"
              hint="حداقل ۸ کاراکتر"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
              phone={phone}
              code={code}
              onCodeChange={setCode}
              onSubmit={submitReset}
              onResend={resendCode}
              onBack={() => {
                setSentAt(null);
                setCode("");
              }}
              loading={loading}
              sentAt={sentAt}
              submitLabel="تغییر رمز عبور"
            />

            <p className="flex gap-2 text-body-xs text-text-secondary mt-5 p-3 rounded-field bg-warning-soft/60 leading-relaxed">
              <InformationCircleIcon className="w-4 h-4 shrink-0 mt-0.5 text-warning-fg" />
              با تغییر رمز، از همه‌ی دستگاه‌هایی که وارد بوده‌اید خارج می‌شوید
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
