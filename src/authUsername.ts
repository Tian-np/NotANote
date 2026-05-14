import type { User } from "@supabase/supabase-js";

/**
 * Supabase password auth only accepts `email` + `password` (no native username field).
 * We encode each username as a deterministic synthetic address so:
 * - No real inbox or email verification is involved.
 * - Sign-up / sign-in still use the standard Email provider APIs.
 *
 * This string is the fixed domain part of that synthetic address (never used for delivery).
 */
export const USERNAME_AUTH_EMAIL_DOMAIN = "users.notanote.invalid";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  const n = normalizeUsername(raw);
  return /^[a-z0-9_]{3,32}$/.test(n);
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${USERNAME_AUTH_EMAIL_DOMAIN}`;
}

export function displayUsername(user: User): string {
  const meta = user.user_metadata?.username;
  if (typeof meta === "string" && meta.length > 0) return meta;
  const em = user.email;
  if (em?.endsWith(`@${USERNAME_AUTH_EMAIL_DOMAIN}`)) {
    return em.slice(0, -(USERNAME_AUTH_EMAIL_DOMAIN.length + 1));
  }
  return em ?? "User";
}
