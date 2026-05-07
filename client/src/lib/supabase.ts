import { createClient } from "@supabase/supabase-js";

// Service role key — this is a private admin tool, not exposed to the public.
// The Passage Reviewer is password-protected and served only to trusted users.
const SUPABASE_URL = "https://tamqiesklcjetftnumpm.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhbXFpZXNrbGNqZXRmdG51bXBtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc0NzA1NiwiZXhwIjoyMDg5MzIzMDU2fQ.IX-S4JfFurU1yErYPSMBhIVltB4rp_Q0GHDsK3rOwl4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
