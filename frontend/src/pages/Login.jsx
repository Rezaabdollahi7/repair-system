// src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { login } from "../api";
import toast from "react-hot-toast";

export default function Login() {
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(form);
      loginUser(res.data.token, res.data.user);
      toast.success("خوش آمدید!");
      navigate("/devices", { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || "خطا در ورود";
      toast.error(msg);
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
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 
                         focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
              dir="ltr"
            />
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
