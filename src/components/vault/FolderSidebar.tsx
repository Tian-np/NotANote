import { useState } from "react";
import { ChevronRight, Folder, FolderOpen, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { childrenOf } from "@/folderUtils";
import type { VaultFolder } from "@/types";
import { DND_ENTRY_MIME } from "./vaultUtils";

type FolderTreeProps = {
  folders: VaultFolder[];
  currentFolderId: string | null;
  dropHoverFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  onFolderDragOver: (folderId: string) => (e: React.DragEvent) => void;
  onFolderDragLeave: (e: React.DragEvent) => void;
  onFolderDrop: (folderId: string) => (e: React.DragEvent) => void;
};

function TreeNode({
  folder,
  folders,
  depth,
  currentFolderId,
  dropHoverFolderId,
  expanded,
  onToggleExpand,
  onNavigate,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
}: {
  folder: VaultFolder;
  folders: VaultFolder[];
  depth: number;
  currentFolderId: string | null;
  dropHoverFolderId: string | null;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onNavigate: (folderId: string | null) => void;
  onFolderDragOver: (folderId: string) => (e: React.DragEvent) => void;
  onFolderDragLeave: (e: React.DragEvent) => void;
  onFolderDrop: (folderId: string) => (e: React.DragEvent) => void;
}) {
  const kids = childrenOf(folders, folder.id);
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = currentFolderId === folder.id;

  return (
    <div>
      <div className="flex items-center" style={{ paddingLeft: depth * 12 }}>
        {hasKids ? (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label={isOpen ? "ย่อ" : "ขยาย"}
            onClick={() => onToggleExpand(folder.id)}
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")}
              aria-hidden
            />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )}
        <Button
          type="button"
          variant={isActive ? "secondary" : "ghost"}
          className={cn(
            "h-8 min-w-0 flex-1 justify-start gap-2 px-2 font-normal",
            dropHoverFolderId === folder.id &&
              "bg-primary/15 ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
          )}
          onClick={() => onNavigate(folder.id)}
          onDragOver={onFolderDragOver(folder.id)}
          onDragLeave={onFolderDragLeave}
          onDrop={onFolderDrop(folder.id)}
        >
          {isActive ? (
            <FolderOpen className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          ) : (
            <Folder className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          )}
          <span className="truncate">{folder.name}</span>
        </Button>
      </div>
      {hasKids && isOpen
        ? kids.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              folders={folders}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              dropHoverFolderId={dropHoverFolderId}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onNavigate={onNavigate}
              onFolderDragOver={onFolderDragOver}
              onFolderDragLeave={onFolderDragLeave}
              onFolderDrop={onFolderDrop}
            />
          ))
        : null}
    </div>
  );
}

export function FolderSidebar({
  folders,
  currentFolderId,
  dropHoverFolderId,
  onNavigate,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const roots = childrenOf(folders, null);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-card/30 p-4 lg:flex lg:flex-col">
      <p className="mb-2 text-sm font-medium text-muted-foreground">หมวดหมู่</p>
      <nav className="flex flex-col gap-0.5 overflow-y-auto" aria-label="ต้นไม้หมวดหมู่">
        <Button
          type="button"
          variant={currentFolderId === null ? "secondary" : "ghost"}
          className="h-8 justify-start gap-2 px-2 font-normal"
          onClick={() => onNavigate(null)}
        >
          <Home className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
          หน้าหลัก
        </Button>
        {roots.map((f) => (
          <TreeNode
            key={f.id}
            folder={f}
            folders={folders}
            depth={0}
            currentFolderId={currentFolderId}
            dropHoverFolderId={dropHoverFolderId}
            expanded={expanded}
            onToggleExpand={toggleExpand}
            onNavigate={onNavigate}
            onFolderDragOver={onFolderDragOver}
            onFolderDragLeave={onFolderDragLeave}
            onFolderDrop={onFolderDrop}
          />
        ))}
      </nav>
      <p className="mt-auto pt-4 text-xs leading-relaxed text-muted-foreground">
        ลากรายการมาวางที่การ์ดหมวดหรือชื่อหมวดในแถบข้างเพื่อย้ายเข้าหมวดย่อย
      </p>
    </aside>
  );
}
