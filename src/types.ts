import { LIMITS, truncateField } from "./security";
import type { LockPinConfig } from "./entryLock";

export type EntryType = "note" | "login";

export interface VaultFolder {
  id: string;
  name: string;
  updatedAt: number;
  /** null = ระดับราก */
  parentId?: string | null;
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
  locked?: boolean;
  lockedPayload?: string;
}

export interface VaultData {
  version: 2;
  folders: VaultFolder[];
  entries: VaultEntry[];
  lockPin?: LockPinConfig;
}

export function emptyVault(): VaultData {
  return { version: 2, folders: [], entries: [] };
}

function sanitizeEntry(raw: VaultEntry): VaultEntry {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
    throw new Error("Invalid vault");
  }
  if (raw.type !== "note" && raw.type !== "login") throw new Error("Invalid vault");
  const locked = Boolean(raw.locked && typeof raw.lockedPayload === "string");
  if (locked) {
    return {
      id: raw.id,
      type: raw.type,
      title: "",
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      folderId: typeof raw.folderId === "string" ? raw.folderId : null,
      locked: true,
      lockedPayload: raw.lockedPayload,
    };
  }
  return {
    id: raw.id,
    type: raw.type,
    title: truncateField(String(raw.title ?? ""), LIMITS.title),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    content:
      raw.content != null
        ? truncateField(String(raw.content), LIMITS.content)
        : undefined,
    url: raw.url != null ? truncateField(String(raw.url), LIMITS.url) : undefined,
    username:
      raw.username != null
        ? truncateField(String(raw.username), LIMITS.username)
        : undefined,
    password:
      raw.password != null
        ? truncateField(String(raw.password), LIMITS.entryPassword)
        : undefined,
    folderId: typeof raw.folderId === "string" ? raw.folderId : null,
  };
}

function sanitizeLockPin(raw: unknown): LockPinConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.saltB64 !== "string" || typeof o.verifierB64 !== "string") return undefined;
  if (o.saltB64.length > 64 || o.verifierB64.length > 128) return undefined;
  return { saltB64: o.saltB64, verifierB64: o.verifierB64 };
}

function sanitizeFolder(raw: VaultFolder, allIds: Set<string>): VaultFolder {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
    throw new Error("Invalid vault");
  }
  let parentId: string | null = null;
  if (typeof raw.parentId === "string") {
    parentId = allIds.has(raw.parentId) && raw.parentId !== raw.id ? raw.parentId : null;
  }
  return {
    id: raw.id,
    name: truncateField(String(raw.name ?? ""), LIMITS.folderName),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    parentId,
  };
}

/** แปลง payload เวอร์ชันเก่า (v1) หรือตรวจ v2 หลังถอดรหัส */
export function normalizeVaultData(parsed: unknown): VaultData {
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid vault");
  const o = parsed as Record<string, unknown>;
  const version = o.version;
  if (version !== 1 && version !== 2) throw new Error("Invalid vault");

  if (!Array.isArray(o.entries)) throw new Error("Invalid vault");
  if (o.entries.length > LIMITS.maxEntries) throw new Error("Invalid vault");

  const entries = (o.entries as VaultEntry[]).map(sanitizeEntry);

  if (version === 1) {
    return { version: 2, folders: [], entries };
  }

  if (!Array.isArray(o.folders)) throw new Error("Invalid vault");
  if (o.folders.length > LIMITS.maxFolders) throw new Error("Invalid vault");
  const rawFolders = o.folders as VaultFolder[];
  const folderIds = new Set(rawFolders.map((f) => f.id));
  const folders = rawFolders.map((f) => sanitizeFolder(f, folderIds));
  const lockPin = sanitizeLockPin(o.lockPin);

  return { version: 2, folders, entries, ...(lockPin ? { lockPin } : {}) };
}
