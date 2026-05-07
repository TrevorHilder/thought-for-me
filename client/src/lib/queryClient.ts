import { QueryClient } from "@tanstack/react-query";

// All data access goes through Supabase directly — no Express backend.
// This file is kept minimal.

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
