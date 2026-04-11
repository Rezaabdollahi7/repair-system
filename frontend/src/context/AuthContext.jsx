// src/context/AuthContext.jsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { getMe } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    console.log("token:", token);
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((res) => {
        console.log("getMe response:", res.data);
        setUser(res.data);
      })
      .catch(() => {
        console.log("getMe error:", err.response);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      })
      .finally(() => setLoading(false));
  }, []);

  const loginUser = useCallback((token, userData) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logoutUser = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (...roles) => user && roles.includes(user.role),
    [user],
  );

  const isAtLeast = useCallback(
    (minRole) => {
      const hierarchy = { super_admin: 3, admin: 2, technician: 1 };
      return user && (hierarchy[user.role] ?? 0) >= (hierarchy[minRole] ?? 0);
    },
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
