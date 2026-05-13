import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredBlob } from "./storage";

export async function fetchVaultPayload(sb: SupabaseClient, userId: string): Promise<StoredBlob | null> {
  const { data, error } = await sb.from("user_vaults").select("payload").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data?.payload) return null;
  const p = data.payload as StoredBlob;
  if (!p?.saltB64 || !p?.payloadB64) return null;
  return p;
}

export async function upsertVaultPayload(sb: SupabaseClient, userId: string, blob: StoredBlob): Promise<void> {
  const { error } = await sb.from("user_vaults").upsert(
    {
      user_id: userId,
      payload: blob,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}
