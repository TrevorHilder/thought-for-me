/**
 * auth.tsx — Lightweight auth context backed by Supabase.
 *
 * Exposes the currently-logged-in user, sourced from Supabase's session.
 * The appStore.tsx owns the Supabase onAuthStateChange subscription for
 * data hydration; this context is kept thin — it just tracks who's logged in.
 *
 * Session is restored on page reload via supabase.auth.getSession().
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);

  // Restore session on mount and listen for changes
  useEffect(() => {
    // Check for an existing session (handles page reloads)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserState({
          id: session.user.id,
          email: session.user.email ?? "",
        });
      }
    });

    // Subscribe to future auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserState({
          id: session.user.id,
          email: session.user.email ?? "",
        });
      } else {
        setUserState(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setUser = (u: AuthUser | null) => {
    setUserState(u);
  };

  const logout = () => {
    supabase.auth.signOut().catch((err) => {
      console.error("Sign out error:", err);
    });
    // setUserState will be updated via onAuthStateChange
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
