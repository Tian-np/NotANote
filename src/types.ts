export type EntryType = "note" | "login";

export interface VaultEntry {
  id: string;
  type: EntryType;
  title: string;
  updatedAt: number;
  content?: string;
  url?: string;
  username?: string;
  password?: string;
}

export interface VaultData {
  version: 1;
  entries: VaultEntry[];
}

export function emptyVault(): VaultData {
  return { version: 1, entries: [] };
}
