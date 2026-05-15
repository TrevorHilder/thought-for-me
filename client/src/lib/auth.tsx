/**
 * auth.tsx — Lightweight auth context backed by Supabase.
 *
 * PASSWORD_RECOVERY flow:
 *   Supabase emails a link → user clicks → Supabase verifies server-side →
 *   redirects to app with #access_token=...&type=recovery in the URL hash.
 *   supabase-js (detectSessionInUrl: true by default) exchanges that token
 *   immediately on module load, before React mounts.  We therefore cannot
 *   rely solely on onAuthStateChange to catch PASSWORD_RECOVERY — it may
 *   have already fired.  Instead we also inspect the URL hash synchronously
 *   at startup and call getSession() to confirm a recovery session exists.
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

/** Check synchronously whether the current URL hash contains type=recovery */
function hashIsRecovery(): boolean {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    return params.get("type") === "recovery";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  // Pre-initialise isRecovery from the URL hash so it's true before
  // the first render if the user just clicked a recovery link.
  const [isRecovery, setIsRecovery] = useState(() => hashIsRecovery());

  useEffect(() => {
    // On mount, confirm the session and set the user.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserState({
          id: session.user.id,
          email: session.user.email ?? "",
        });
      }
      // If the hash flagged recovery but somehow there's no session yet,
      // leave isRecovery true — onAuthStateChange will handle it.
    });

    // Subscribe to future auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
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

  const setUser = (u: AuthUser | null) => setUserState(u);

  const clearRecovery = () => {
    setIsRecovery(false);
    // Clean the recovery tokens out of the URL so a page reload doesn't
    // re-trigger recovery mode.
    if (window.location.hash && window.location.hash.includes("type=recovery")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  };

  const logout = () => {
    supabase.auth.signOut().catch((err) => {
      console.error("Sign out error:", err);
    });
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
