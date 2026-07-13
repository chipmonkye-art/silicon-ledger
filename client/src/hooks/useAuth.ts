import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";
import type { User } from "@/types";

export function useAuth() {
  const { user, token, setAuth, logout } = useAuthStore();

  useEffect(() => {
    if (token && !user) {
      api.get<{ user: User }>("/auth/me")
        .then((res) => setAuth(res.user, token))
        .catch(() => logout());
    }
  }, [token, user, setAuth, logout]);

  return { user, token, isAuthenticated: !!token, login: setAuth, logout };
}
