import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anon) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  }
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
