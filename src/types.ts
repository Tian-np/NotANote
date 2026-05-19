export type EntryType = "note" | "login";

export interface VaultFolder {
  id: string;
  name: string;
  updatedAt: number;
}

export interface VaultEntry {
  id: string;
  type: EntryType;
  title: string;
  updatedAt: number;
  content?: string;
  url?: string;
  username?: string;
  password?: string;
  /** อยู่ในหมวดนี้ — ไม่มีหรือ null = ยังไม่จัดกลุ่ม */
  folderId?: string | null;
}

export interface VaultData {
  version: 2;
  folders: VaultFolder[];
  entries: VaultEntry[];
}

export function emptyVault(): VaultData {
  return { version: 2, folders: [], entries: [] };
}

/** แปลง payload เวอร์ชันเก่า (v1) หรือตรวจ v2 หลังถอดรหัส */
export function normalizeVaultData(parsed: unknown): VaultData {
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid vault");
  const o = parsed as Record<string, unknown>;
  const version = o.version;
  if (version !== 1 && version !== 2) throw new Error("Invalid vault");

  if (!Array.isArray(o.entries)) throw new Error("Invalid vault");

  const entries = (o.entries as VaultEntry[]).map((e) => ({
    ...e,
    folderId: e.folderId ?? null,
  }));

  if (version === 1) {
    return { version: 2, folders: [], entries };
  }

  if (!Array.isArray(o.folders)) throw new Error("Invalid vault");
  const folders = (o.folders as VaultFolder[]).map((f) => ({
    ...f,
    updatedAt: typeof f.updatedAt === "number" ? f.updatedAt : Date.now(),
  }));

  return { version: 2, folders, entries };
}
