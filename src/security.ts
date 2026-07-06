/** Shared security limits and validators for NotANote. */

export const MIN_PASSWORD_LENGTH = 8;

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const LIMITS = {
  title: 200,
  content: 50_000,
  url: 2048,
  username: 256,
  entryPassword: 512,
  folderName: 100,
  searchQuery: 200,
  maxEntries: 5000,
  maxFolders: 200,
} as const;

/** Lock vault when the tab stays hidden longer than this. */
export const HIDDEN_TAB_LOCK_MS = 2 * 60 * 1000;

/** Clear sensitive clipboard copies after this duration. */
export const CLIPBOARD_CLEAR_MS = 30_000;

export function truncateField(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function isValidImportBlob(parsed: unknown): parsed is { saltB64: string; payloadB64: string } {
  if (!parsed || typeof parsed !== "object") return false;
  const o = parsed as Record<string, unknown>;
  if (typeof o.saltB64 !== "string" || typeof o.payloadB64 !== "string") return false;
  if (o.saltB64.length > 64 || o.payloadB64.length > 10_000_000) return false;
  return true;
}
