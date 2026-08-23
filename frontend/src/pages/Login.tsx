import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { login } from "../api";
import toast from "react-hot-toast";
import { errorText } from "../utils/errors";

export default function Login() {
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form);
      loginUser(res.data.token, res.data.user);
      toast.success("خوش آمدید!");
      navigate("/devices", { replace: true });
    } catch (err) {
      toast.error(errorText(err, "خطا در ورود"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="bg-surface rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-text-primary mb-6">
          ورود به سیستم
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              شماره موبایل
            </label>
            <input
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 
                         focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
              placeholder="09123456789"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              رمز عبور
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 pr-10
                           focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                placeholder="••••••••"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 -translate-y-1/2 right-3 text-text-secondary 
                           hover:text-text-primary transition-colors focus:outline-none"
                tabIndex={-1}
                aria-label={
                  showPassword ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"
                }
                title={showPassword ? "مخفی کردن" : "نمایش"}
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7a11.79 11.79 0 014.33-5.27M6.92 6.92A11.97 11.97 0 0112 5c5 0 9.27 3.11 11 7a11.8 11.8 0 01-2.16 3.13m-6.72-1.03A3 3 0 119.9 9.9M3 3l18 18"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.458 12C4.186 7.88 7.763 5 12 5c4.237 0 7.814 2.88 9.542 7-1.728 4.12-5.305 7-9.542 7-4.237 0-7.814-2.88-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-hover text-text-inverse 
                       font-semibold py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "در حال ورود..." : "ورود"}
          </button>
        </form>

        <p className="text-sm text-center text-text-secondary mt-6">
          کارگاه ندارید؟{" "}
          <Link to="/register" className="text-primary hover:underline">
            ساخت کارگاه جدید
          </Link>
        </p>
      </div>
    </div>
  );
}
