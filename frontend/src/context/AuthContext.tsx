import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  logout as logoutRequest,
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
} from "../api";
import type { AuthUser, RoleName } from "../types/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginUser: (token: string, userData: AuthUser) => void;
  logoutUser: () => Promise<void>;
  hasRole: (...roles: RoleName[]) => boolean;
  isAtLeast: (minRole: RoleName) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_HIERARCHY: Record<RoleName, number> = {
  super_admin: 3,
  admin: 2,
  technician: 1,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Restores the session on load. The access token lives in memory, so a
  // reload always starts without one — the refresh cookie is what survives,
  // and it answers both "is this session still good" and "who is it" in a
  // single round trip.
  useEffect(() => {
    let cancelled = false;

    refreshSession()
      .then((data) => {
        if (!cancelled) setUser(data.user);
      })
      .catch(() => {
        // No cookie, or one that has expired or been revoked. Not an error
        // worth reporting: it is simply what a first visit looks like.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Lets the Axios interceptor end the session without reaching for
  // window.location, which would discard the whole React tree.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      navigate("/login", { replace: true });
    });

    return () => setSessionExpiredHandler(null);
  }, [navigate]);

  const loginUser = useCallback((token: string, userData: AuthUser) => {
    // Held in the api module rather than state: the request interceptor
    // needs it synchronously, before React would have re-rendered.
    setAccessToken(token);
    setUser(userData);
  }, []);

  const logoutUser = useCallback(async () => {
    try {
      // Ends the session server-side too. Without this the refresh cookie
      // stays valid and the next visit signs itself back in.
      await logoutRequest();
    } catch {
      // Already gone, or the network is down. Either way the local half of
      // logging out must still happen.
    }

    setAccessToken(null);
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  const hasRole = useCallback(
    (...roles: RoleName[]) => user !== null && roles.includes(user.role),
    [user],
  );

  const isAtLeast = useCallback(
    (minRole: RoleName) =>
      user !== null &&
      // The fallbacks are unreachable through these types but stay as a
      // runtime floor: `role` arrives from the server, and a role added to
      // the seeded table without being added here would otherwise rank
      // above super admin as NaN comparisons go false either way.
      (ROLE_HIERARCHY[user.role] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0),
    [user],
  );

  return (
    <AuthContext.Provider
      value={{ user, loading, loginUser, logoutUser, hasRole, isAtLeast }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
