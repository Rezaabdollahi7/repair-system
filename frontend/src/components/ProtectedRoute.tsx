import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { RoleName } from "../types/api";

interface ProtectedRouteProps {
  minRole?: RoleName;
}

export default function ProtectedRoute({ minRole }: ProtectedRouteProps) {
  const { user, loading, isAtLeast } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-500">در حال بارگذاری...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (minRole && !isAtLeast(minRole)) return <Navigate to="/devices" replace />;

  return <Outlet />;
}
