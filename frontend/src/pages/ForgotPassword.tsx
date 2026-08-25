import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { resetPassword, sendOtp } from "../api";
import { errorText } from "../utils/errors";
import OtpCodeStep from "../components/OtpCodeStep";

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

  const inputClass =
    "w-full border border-border rounded-lg px-3 py-2 focus:outline-none " +
    "focus:ring-2 focus:ring-primary bg-surface text-text-primary";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-surface rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-text-primary mb-2">
          فراموشی رمز عبور
        </h1>
        <p className="text-sm text-center text-text-secondary mb-6">
          با شماره‌ی موبایلتان رمز تازه بسازید
        </p>

        {sentAt === null ? (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                شماره موبایل
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                dir="ltr"
                className={inputClass}
              />
              <p className="text-xs text-text-secondary mt-1">
                همان شماره‌ای که با آن وارد می‌شوید
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                رمز عبور تازه
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                dir="ltr"
                className={inputClass}
              />
              {/* Chosen before the code, like sign-up: the code is spent in
                  the same request that sets it, so there is nothing held on
                  the server in between. */}
              <p className="text-xs text-text-secondary mt-1">
                حداقل ۸ کاراکتر
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover text-text-inverse
                         font-semibold py-2 rounded-lg transition disabled:opacity-50"
            >
              {loading ? "در حال ارسال کد..." : "ادامه"}
            </button>
          </form>
        ) : (
          <>
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
            <p className="text-xs text-center text-text-secondary mt-4">
              با تغییر رمز، از همه‌ی دستگاه‌هایی که وارد بوده‌اید خارج
              می‌شوید
            </p>
          </>
        )}

        <p className="text-sm text-center text-text-secondary mt-6">
          <Link to="/login" className="text-primary hover:underline">
            بازگشت به ورود
          </Link>
        </p>
      </div>
    </div>
  );
}
