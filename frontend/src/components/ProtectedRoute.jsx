// src/components/ProtectedRoute.jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ minRole }) {
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
