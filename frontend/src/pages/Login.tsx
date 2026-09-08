import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DevicePhoneMobileIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { login } from "../api";
import { errorText } from "../utils/errors";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthSubmit from "../components/AuthSubmit";

export default function Login() {
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);

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
    <AuthLayout
      title="ورود به حساب"
      subtitle="با شماره‌ای که کارگاه را با آن ساخته‌اید وارد شوید"
      footer={
        <>
          کارگاه ندارید؟{" "}
          <Link
            to="/register"
            className="text-primary font-medium hover:underline"
          >
            ساخت کارگاه جدید
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="شماره موبایل"
          type="tel"
          required
          autoComplete="username"
          icon={DevicePhoneMobileIcon}
          placeholder="09123456789"
          dir="ltr"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />

        <AuthField
          label="رمز عبور"
          type="password"
          required
          autoComplete="current-password"
          icon={LockClosedIcon}
          placeholder="••••••••"
          dir="ltr"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {/* Above the button rather than below it: the person who needs this
            link is not going to press "ورود" first. */}
        <div className="flex justify-start">
          <Link
            to="/forgot-password"
            className="text-body-sm text-text-secondary hover:text-primary transition-colors"
          >
            رمز عبور را فراموش کرده‌اید؟
          </Link>
        </div>

        <AuthSubmit loading={loading}>
          {loading ? "در حال ورود" : "ورود"}
        </AuthSubmit>
      </form>
    </AuthLayout>
  );
}
