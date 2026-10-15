"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, login, logout, refreshSession, register } from "@/api";
import { onUnauthorized } from "@/api/client";
import type { components } from "@/api/generated/schema";
import { NETWORK_ERROR_MESSAGE, parseApiFailure, type ApiFailure } from "@/lib/api-error";
import { can, type Action } from "@/lib/permissions";

export type SessionUser = components["schemas"]["UserProfileResponse"];
type LoginRequest = components["schemas"]["LoginRequest"];
type RegisterRequest = components["schemas"]["RegisterRequest"];

type SessionState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated"; user: null };

/** Resolves on success; on failure resolves with the parsed error so forms can show it. */
export type AuthResult = { ok: true } | { ok: false; failure: ApiFailure };

interface SessionContextValue {
  status: SessionState["status"];
  user: SessionUser | null;
  signIn: (credentials: LoginRequest) => Promise<AuthResult>;
  signUp: (payload: RegisterRequest) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  can: (action: Action) => boolean;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

/**
 * Holds who is signed in. The browser keeps the tokens in httpOnly cookies, so the only way
 * to know the session is valid is to ask the API (`GET /auth/me`) — nothing is read from storage.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = React.useState<SessionState>({ status: "loading", user: null });

  const loadUser = React.useCallback(async (): Promise<SessionUser | null> => {
    try {
      const first = await getCurrentUser();
      if (first.data) return first.data;
      if (first.response.status !== 401) return null;

      // The 15-minute access cookie may have expired while the 7-day refresh cookie is still good.
      const refreshed = await refreshSession();
      if (!refreshed.response.ok) return null;
      return (await getCurrentUser()).data ?? null;
    } catch {
      return null;
    }
  }, []);

  const establish = React.useCallback(async (): Promise<AuthResult> => {
    const user = await loadUser();
    if (!user) {
      setState({ status: "unauthenticated", user: null });
      return { ok: false, failure: { message: "Could not load your profile.", fields: {} } };
    }
    setState({ status: "authenticated", user });
    return { ok: true };
  }, [loadUser]);

  // Restore the session after a page load.
  React.useEffect(() => {
    let active = true;
    loadUser().then((user) => {
      if (!active) return;
      setState(
        user ? { status: "authenticated", user } : { status: "unauthenticated", user: null }
      );
    });
    return () => {
      active = false;
    };
  }, [loadUser]);

  // The API client reports when a refresh failed and the session is really gone.
  React.useEffect(
    () => onUnauthorized(() => setState({ status: "unauthenticated", user: null })),
    []
  );

  const signIn = React.useCallback(
    async (credentials: LoginRequest): Promise<AuthResult> => {
      try {
        const { error, response } = await login(credentials);
        if (error) return { ok: false, failure: parseApiFailure(error, response.status) };
      } catch {
        return { ok: false, failure: { message: NETWORK_ERROR_MESSAGE, fields: {} } };
      }
      return establish();
    },
    [establish]
  );

  const signUp = React.useCallback(
    async (payload: RegisterRequest): Promise<AuthResult> => {
      try {
        const { error, response } = await register(payload);
        if (error) return { ok: false, failure: parseApiFailure(error, response.status) };
      } catch {
        return { ok: false, failure: { message: NETWORK_ERROR_MESSAGE, fields: {} } };
      }
      return establish();
    },
    [establish]
  );

  const signOut = React.useCallback(async () => {
    try {
      await logout();
    } catch {
      // Even if the call fails the user asked to leave; drop the local session regardless.
    }
    setState({ status: "unauthenticated", user: null });
    router.replace("/login");
  }, [router]);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      signIn,
      signUp,
      signOut,
      can: (action) => can(state.user?.role, action),
    }),
    [state, signIn, signUp, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
