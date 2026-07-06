import { LIMITS } from "./security";
import type { VaultFolder } from "./types";

export function folderParentId(folder: VaultFolder): string | null {
  return folder.parentId ?? null;
}

export function childrenOf(
  folders: VaultFolder[],
  parentId: string | null,
): VaultFolder[] {
  return folders
    .filter((f) => folderParentId(f) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "th", { sensitivity: "base" }));
}

export function ancestorsOf(
  folders: VaultFolder[],
  folderId: string,
): VaultFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: VaultFolder[] = [];
  let cur: VaultFolder | undefined = byId.get(folderId);
  while (cur) {
    out.unshift(cur);
    const pid = folderParentId(cur);
    cur = pid ? byId.get(pid) : undefined;
  }
  return out;
}

export function descendantIds(folders: VaultFolder[], folderId: string): Set<string> {
  const out = new Set<string>();
  const walk = (parentId: string) => {
    for (const f of folders) {
      if (folderParentId(f) === parentId) {
        out.add(f.id);
        walk(f.id);
      }
    }
  };
  walk(folderId);
  return out;
}

export function hasChildFolders(folders: VaultFolder[], folderId: string): boolean {
  return folders.some((f) => folderParentId(f) === folderId);
}

export function folderPathLabel(folders: VaultFolder[], folderId: string | null | undefined): string {
  if (!folderId) return "";
  return ancestorsOf(folders, folderId)
    .map((f) => f.name)
    .join(" / ");
}

export function folderDepth(folders: VaultFolder[], folderId: string | null): number {
  if (!folderId) return 0;
  return ancestorsOf(folders, folderId).length;
}

export function wouldCreateCycle(
  folders: VaultFolder[],
  folderId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  if (newParentId === folderId) return true;
  return descendantIds(folders, folderId).has(newParentId);
}

export function isValidParentId(
  folders: VaultFolder[],
  parentId: string | null,
): boolean {
  if (!parentId) return true;
  if (!folders.some((f) => f.id === parentId)) return false;
  const depth = folderDepth(folders, parentId);
  return depth < LIMITS.maxFolderDepth;
}

/** Options for folder &lt;select&gt; with indented path labels. */
export function folderSelectOptions(
  folders: VaultFolder[],
): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = [];

  const walk = (parentId: string | null, depth: number) => {
    for (const f of childrenOf(folders, parentId)) {
      out.push({
        id: f.id,
        label: folderPathLabel(folders, f.id),
        depth,
      });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function countEntriesInFolder(
  entries: { folderId?: string | null }[],
  folderId: string,
): number {
  return entries.filter((e) => e.folderId === folderId).length;
}
