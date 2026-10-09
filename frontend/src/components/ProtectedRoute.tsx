import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "./LoadingSpinner";
import type { RoleName } from "../types/api";

interface ProtectedRouteProps {
  minRole?: RoleName;
}

export default function ProtectedRoute({ minRole }: ProtectedRouteProps) {
  const { user, loading, isAtLeast } = useAuth();

  // This screen is what a reload shows while /auth/refresh is in flight, so
  // it is the first thing a returning user sees — it gets the app's own
  // spinner and background rather than the bare text it used to have.
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (minRole && !isAtLeast(minRole)) return <Navigate to="/devices" replace />;

  return <Outlet />;
}
