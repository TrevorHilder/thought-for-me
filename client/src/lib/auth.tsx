/**
 * auth.tsx — Lightweight auth context backed by Supabase.
 *
 * Exposes the currently-logged-in user, sourced from Supabase's session.
 * The appStore.tsx owns the Supabase onAuthStateChange subscription for
 * data hydration; this context is kept thin — it just tracks who's logged in.
 *
 * Session is restored on page reload via supabase.auth.getSession().
 *
 * PASSWORD_RECOVERY: when Supabase redirects back from a reset link it fires
 * a PASSWORD_RECOVERY event (with a valid session). We capture that separately
 * so AppRouter can send the user to /reset-password rather than treating them
 * as fully logged in.
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
  isRecovery: boolean;
  clearRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  setUser: () => {},
  logout: () => {},
  isRecovery: false,
  clearRecovery: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);

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
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        // Don't treat this as a normal login — route to /reset-password instead
        if (session?.user) {
          setUserState({
            id: session.user.id,
            email: session.user.email ?? "",
          });
        }
        setIsRecovery(true);
        return;
      }

      if (session?.user) {
        setUserState({
          id: session.user.id,
          email: session.user.email ?? "",
        });
      } else {
        setUserState(null);
        setIsRecovery(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setUser = (u: AuthUser | null) => {
    setUserState(u);
  };

  const clearRecovery = () => {
    setIsRecovery(false);
  };

  const logout = () => {
    supabase.auth.signOut().catch((err) => {
      console.error("Sign out error:", err);
    });
    // setUserState will be updated via onAuthStateChange
  };

  return (
    <AuthContext.Provider value={{ user, setUser, logout, isRecovery, clearRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
