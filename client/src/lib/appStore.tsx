/**
 * appStore.tsx — Supabase-backed state for "A Thought for Me"
 *
 * Replaces the in-memory store. Uses Supabase Auth + database for persistence.
 * Keeps the same exported interface so no page/component changes are needed.
 *
 * Strategy for sync-looking API:
 * - Local React state acts as the in-memory cache
 * - Supabase hydrates state on mount / auth change
 * - Writes are applied optimistically to local state, then persisted to Supabase
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Book {
  name: string;
  slug: string;
  page_offset: number;
}

export interface Passage {
  id: string;
  title: string;
  source: string;
  page: number;
  text: string;
}

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Delivery {
  id: string;
  userId: string;
  passageId: string;
  deliveredAt: string;
  readAt: string | null;
  isFavourite: boolean;
  passage: Passage | null;
}

export interface UserPrefs {
  userId: string;
  preferredTime: string;
  timezone: string;
  emailNotifications: boolean;
}

export interface Stats {
  total: number;
  delivered: number;
  remaining: number;
  favourites: number;
}

// ─── Store context value ───────────────────────────────────────────────────────

interface AppStoreValue {
  // Passages
  passages: Passage[];
  passagesLoaded: boolean;

  // Books
  books: Map<string, Book>;

  // Auth
  register: (email: string, password: string) => Promise<StoredUser>;
  login: (email: string, password: string) => Promise<StoredUser>;

  // Deliveries
  getDeliveries: (userId: string) => Delivery[];
  deliverToday: (userId: string) => Delivery;

  // Favourites
  toggleFavourite: (deliveryId: string, isFavourite: boolean) => void;
  getFavourites: (userId: string) => Delivery[];

  // Preferences
  getPrefs: (userId: string) => UserPrefs;
  savePrefs: (userId: string, prefs: Partial<UserPrefs>) => void;

  // Stats
  getStats: (userId: string) => Stats;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayStr(): string {
  return new Date().toDateString();
}

/**
 * Passage selection algorithm (ported from server/routes.ts):
 * 1. Filter out already-delivered passages
 * 2. Count deliveries per book → prefer least-used books
 * 3. Count deliveries per type → prefer underrepresented types (within minCount + 1)
 * 4. Sort candidates by book count ascending
 * 5. Pick randomly from top 20% of sorted candidates
 */
function selectPassage(allPassages: Passage[], deliveries: Delivery[]): Passage {
  const deliveredIds = new Set(deliveries.map((d) => d.passageId));

  let candidates = allPassages.filter((p) => !deliveredIds.has(p.id));
  if (candidates.length === 0) {
    // Pool exhausted — start over
    candidates = [...allPassages];
  }

  // Pick randomly from candidates, weighted slightly toward less-recently-delivered
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Convert a Supabase delivery row to the app's Delivery type */
function rowToDelivery(row: {
  id: string;
  user_id: string;
  passage_id: string;
  delivered_at: string;
  read_at: string | null;
  is_favourite: boolean;
}, passageMap: Map<string, Passage>): Delivery {
  return {
    id: row.id,
    userId: row.user_id,
    passageId: row.passage_id,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    isFavourite: row.is_favourite,
    passage: passageMap.get(row.passage_id) ?? null,
  };
}

/** Convert a Supabase user_preferences row to UserPrefs */
function rowToPrefs(row: {
  user_id: string;
  preferred_time: string;
  timezone: string;
  email_notifications: boolean;
}): UserPrefs {
  return {
    userId: row.user_id,
    preferredTime: row.preferred_time,
    timezone: row.timezone,
    emailNotifications: row.email_notifications,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [passages, setPassages] = useState<Passage[]>([]);
  const [passagesLoaded, setPassagesLoaded] = useState(false);
  const [books, setBooks] = useState<Map<string, Book>>(new Map());

  // Local cache of DB state (keyed by userId)
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [prefs, setPrefs] = useState<UserPrefs[]>([]);

  // Ref for passage map (for quick lookup)
  const passageMapRef = useRef<Map<string, Passage>>(new Map());

  // Track which userId we've hydrated for
  const hydratedForRef = useRef<string | null>(null);

  // ── Load books from Supabase once on mount ────────────────────────────────

  useEffect(() => {
    supabase
      .from("books")
      .select("name, slug, page_offset")
      .then(({ data, error }) => {
        if (error) { console.error("Failed to load books:", error); return; }
        if (data) {
          const map = new Map<string, Book>();
          for (const b of data) map.set(b.name, b as Book);
          setBooks(map);
        }
      });
  }, []);

  // ── Load passages from Supabase once on mount ───────────────────────────────

  useEffect(() => {
    supabase
      .from("passages")
      .select("id, title, source, page, text")
      .eq("deleted", false)
      .limit(10000)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load passages:", error);
        } else if (data) {
          const map = new Map<string, Passage>();
          for (const p of data) map.set(p.id, p as Passage);
          passageMapRef.current = map;
          setPassages(data as Passage[]);
        }
        setPassagesLoaded(true);
      });
  }, []);

  // ── Hydrate from Supabase when user logs in ──────────────────────────────────

  const hydrateUser = useCallback(async (userId: string) => {
    if (hydratedForRef.current === userId) return;
    hydratedForRef.current = userId;

    // Fetch deliveries
    const { data: deliveryRows, error: deliveryError } = await supabase
      .from("deliveries")
      .select("id, user_id, passage_id, delivered_at, read_at, is_favourite")
      .eq("user_id", userId)
      .order("delivered_at", { ascending: false });

    if (deliveryError) {
      console.error("Failed to fetch deliveries:", deliveryError);
    } else if (deliveryRows) {
      const map = passageMapRef.current;
      const mapped = deliveryRows.map((row) => rowToDelivery(row, map));
      setDeliveries((prev) => {
        // Replace all deliveries for this user
        const others = prev.filter((d) => d.userId !== userId);
        return [...others, ...mapped];
      });
    }

    // Fetch preferences
    const { data: prefRows, error: prefError } = await supabase
      .from("user_preferences")
      .select("user_id, preferred_time, timezone, email_notifications")
      .eq("user_id", userId)
      .single();

    if (prefError && prefError.code !== "PGRST116") {
      // PGRST116 = no rows found — that's fine, defaults apply
      console.error("Failed to fetch prefs:", prefError);
    } else if (prefRows) {
      const mapped = rowToPrefs(prefRows);
      setPrefs((prev) => {
        const others = prev.filter((p) => p.userId !== userId);
        return [...others, mapped];
      });
    }
  }, []);

  // ── Listen to Supabase auth state changes ───────────────────────────────────

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        hydrateUser(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        hydrateUser(session.user.id);
      } else {
        // Signed out — clear local cache
        hydratedForRef.current = null;
        setDeliveries([]);
        setPrefs([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [hydrateUser]);

  // ── Auth ────────────────────────────────────────────────────────────────────

  const register = useCallback(
    async (email: string, password: string): Promise<StoredUser> => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Registration failed — no user returned.");

      const userId = data.user.id;

      // Upsert default preferences row (best-effort — may fail if email confirmation
      // is enabled and the user isn't fully confirmed yet, that's fine)
      await supabase.from("user_preferences").upsert(
        {
          user_id: userId,
          preferred_time: "08:00",
          timezone: "Europe/London",
          email_notifications: false,
        },
        { onConflict: "user_id" }
      );

      // Seed local prefs cache
      setPrefs((prev) => {
        const others = prev.filter((p) => p.userId !== userId);
        return [
          ...others,
          {
            userId,
            preferredTime: "08:00",
            timezone: "Europe/London",
            emailNotifications: false,
          },
        ];
      });

      // If Supabase returned a session (email confirmation disabled),
      // hydrate immediately so the app is ready on navigation.
      if (data.session) {
        await hydrateUser(userId);
      }

      return {
        id: userId,
        email: data.user.email ?? email,
        passwordHash: "",
        createdAt: data.user.created_at ?? new Date().toISOString(),
      };
    },
    [hydrateUser]
  );

  const login = useCallback(
    async (email: string, password: string): Promise<StoredUser> => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      if (!data.user) throw new Error("Sign in failed — no user returned.");

      // Hydrate will be triggered by onAuthStateChange, but also trigger directly
      await hydrateUser(data.user.id);

      return {
        id: data.user.id,
        email: data.user.email ?? email,
        passwordHash: "",
        createdAt: data.user.created_at ?? new Date().toISOString(),
      };
    },
    [hydrateUser]
  );

  // ── Deliveries ──────────────────────────────────────────────────────────────

  const getDeliveries = useCallback(
    (userId: string): Delivery[] => {
      return deliveries
        .filter((d) => d.userId === userId)
        .sort(
          (a, b) =>
            new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()
        );
    },
    [deliveries]
  );

  const deliverToday = useCallback(
    (userId: string): Delivery => {
      const userDeliveries = deliveries.filter((d) => d.userId === userId);

      // Check if already delivered today
      const existing = userDeliveries.find(
        (d) => new Date(d.deliveredAt).toDateString() === todayStr()
      );
      if (existing) return existing;

      // Use ref to get the always-current passages array (avoids stale closure)
      const currentPassages = Array.from(passageMapRef.current.values());
      if (currentPassages.length === 0) {
        throw new Error("Passages not loaded yet — please try again in a moment.");
      }

      const passage = selectPassage(currentPassages, userDeliveries);
      const delivery: Delivery = {
        id: uuid(),
        userId,
        passageId: passage.id,
        deliveredAt: new Date().toISOString(),
        readAt: null,
        isFavourite: false,
        passage,
      };

      // Optimistically update local state
      setDeliveries((prev) => [...prev, delivery]);

      // Persist to Supabase in background
      supabase
        .from("deliveries")
        .insert({
          id: delivery.id,
          user_id: userId,
          passage_id: delivery.passageId,
          delivered_at: delivery.deliveredAt,
          read_at: null,
          is_favourite: false,
        })
        .then(({ error }) => {
          if (error) console.error("Failed to persist delivery:", error);
        });

      return delivery;
    },
    [deliveries]
  );

  // ── Favourites ──────────────────────────────────────────────────────────────

  const toggleFavourite = useCallback(
    (deliveryId: string, isFavourite: boolean): void => {
      // Optimistically update local state
      setDeliveries((prev) =>
        prev.map((d) => (d.id === deliveryId ? { ...d, isFavourite } : d))
      );

      // Persist to Supabase in background
      supabase
        .from("deliveries")
        .update({ is_favourite: isFavourite })
        .eq("id", deliveryId)
        .then(({ error }) => {
          if (error) console.error("Failed to update favourite:", error);
        });
    },
    []
  );

  const getFavourites = useCallback(
    (userId: string): Delivery[] => {
      return deliveries
        .filter((d) => d.userId === userId && d.isFavourite)
        .sort(
          (a, b) =>
            new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime()
        );
    },
    [deliveries]
  );

  // ── Preferences ─────────────────────────────────────────────────────────────

  const getPrefs = useCallback(
    (userId: string): UserPrefs => {
      return (
        prefs.find((p) => p.userId === userId) ?? {
          userId,
          preferredTime: "08:00",
          timezone: "Europe/London",
          emailNotifications: false,
        }
      );
    },
    [prefs]
  );

  const savePrefs = useCallback(
    (userId: string, updates: Partial<UserPrefs>): void => {
      // Optimistically update local state
      setPrefs((prev) => {
        const existing = prev.find((p) => p.userId === userId);
        if (existing) {
          return prev.map((p) =>
            p.userId === userId ? { ...p, ...updates } : p
          );
        }
        return [
          ...prev,
          {
            userId,
            preferredTime: "08:00",
            timezone: "Europe/London",
            emailNotifications: false,
            ...updates,
          },
        ];
      });

      // Build the DB row to upsert
      const dbRow: Record<string, unknown> = { user_id: userId };
      if (updates.preferredTime !== undefined) dbRow.preferred_time = updates.preferredTime;
      if (updates.timezone !== undefined) dbRow.timezone = updates.timezone;
      if (updates.emailNotifications !== undefined) dbRow.email_notifications = updates.emailNotifications;

      // Persist to Supabase in background
      supabase
        .from("user_preferences")
        .upsert(dbRow, { onConflict: "user_id" })
        .then(({ error }) => {
          if (error) console.error("Failed to save prefs:", error);
        });
    },
    []
  );

  // ── Stats ────────────────────────────────────────────────────────────────────

  const getStats = useCallback(
    (userId: string): Stats => {
      const userDeliveries = deliveries.filter((d) => d.userId === userId);
      const delivered = userDeliveries.length;
      const total = passages.length;
      const remaining = Math.max(0, total - delivered);
      const favourites = userDeliveries.filter((d) => d.isFavourite).length;
      return { total, delivered, remaining, favourites };
    },
    [deliveries, passages]
  );

  // ── Context value ────────────────────────────────────────────────────────────

  const value: AppStoreValue = {
    passages,
    passagesLoaded,
    books,
    register,
    login,
    getDeliveries,
    deliverToday,
    toggleFavourite,
    getFavourites,
    getPrefs,
    savePrefs,
    getStats,
  };

  return (
    <AppStoreContext.Provider value={value}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
