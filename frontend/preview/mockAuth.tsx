import type { ReactNode } from "react";
export function useAuth() {
  return {
    user: {
      id: 1, username: "09120000001", full_name: "رضا عبداللهی",
      role: "super_admin", role_label: "مدیر ارشد",
    },
    loading: false, loginUser: () => {}, logoutUser: async () => {},
    hasRole: () => true, isAtLeast: () => true,
  };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
