import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, useGetMe, useLogout } from "@workspace/api-client-react";
import type { Employee } from "@workspace/api-client-react";
import { setSessionToken } from "@/lib/realm";

interface AuthContextValue {
  employee: Employee | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  employee: null,
  isLoading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetMe({ query: { retry: false, queryKey: getGetMeQueryKey() } });
  const logoutMutation = useLogout();

  const employee = data ?? null;

  // A 401 means the stored bearer token is stale — drop it so the next login
  // starts clean.
  useEffect(() => {
    if ((error as { status?: number } | null)?.status === 401) setSessionToken(null);
  }, [error]);

  const logout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        setSessionToken(null);
        queryClient.clear();
        window.location.href = "/login";
      },
    });
  };

  return (
    <AuthContext.Provider value={{ employee, isLoading, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
