import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { register, sendOtp } from "../api";
import { errorText } from "../utils/errors";
import OtpCodeStep from "../components/OtpCodeStep";

interface RegisterForm {
  workspace_name: string;
  username: string;
  password: string;
}

export default function Register() {
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<RegisterForm>({
    workspace_name: "",
    username: "",
    password: "",
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
      const res = await register({ ...form, code });
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

  // Shared by the three inputs, which differ only in their validation
  // attributes and placeholder.
  const field = (key: keyof RegisterForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value }),
    className:
      "w-full border border-border rounded-lg px-3 py-2 focus:outline-none " +
      "focus:ring-2 focus:ring-primary bg-surface text-text-primary",
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-surface rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-text-primary mb-2">
          ساخت کارگاه جدید
        </h1>
        <p className="text-sm text-center text-text-secondary mb-6">
          یک ماه رایگان، بدون محدودیت
        </p>

        {sentAt === null ? (
          <form onSubmit={requestCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                نام کارگاه
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                placeholder="تعمیرگاه رضا"
                {...field("workspace_name")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                شماره موبایل
              </label>
              <input
                type="tel"
                required
                placeholder="09123456789"
                dir="ltr"
                {...field("username")}
              />
              <p className="text-xs text-text-secondary mt-1">
                کد تأیید به این شماره فرستاده می‌شود و با همین شماره وارد
                می‌شوید
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                رمز عبور
              </label>
              <input
                type="password"
                required
                // Matches the server's rule rather than guessing at a stricter
                // one: a form that rejects what the API would accept is its own
                // kind of bug.
                minLength={8}
                dir="ltr"
                {...field("password")}
              />
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
        )}

        <p className="text-sm text-center text-text-secondary mt-6">
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <Link to="/login" className="text-primary hover:underline">
            ورود
          </Link>
        </p>
      </div>
    </div>
  );
}
