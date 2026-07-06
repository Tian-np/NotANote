import { Folder } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VaultFolder } from "@/types";
import { DND_ENTRY_MIME } from "./vaultUtils";

type FolderCardProps = {
  folder: VaultFolder;
  entryCount: number;
  childFolderCount: number;
  selectMode: boolean;
  selected: boolean;
  dropHover: boolean;
  onOpen: (folder: VaultFolder) => void;
  onToggleSelect: (folderId: string) => void;
  onRename: (folder: VaultFolder) => void;
  onDelete: (folder: VaultFolder) => void;
  onDropEntry: (folderId: string, entryId: string) => void;
  onDragOver: (folderId: string) => (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
};

export function FolderCard({
  folder,
  entryCount,
  childFolderCount,
  selectMode,
  selected,
  dropHover,
  onOpen,
  onToggleSelect,
  onRename,
  onDelete,
  onDropEntry,
  onDragOver,
  onDragLeave,
}: FolderCardProps) {
  const meta =
    childFolderCount > 0 && entryCount > 0
      ? `${childFolderCount} หมวด · ${entryCount} รายการ`
      : childFolderCount > 0
        ? `${childFolderCount} หมวดย่อย`
        : entryCount > 0
          ? `${entryCount} รายการ`
          : "ว่าง";

  return (
    <Card
      role={selectMode ? "checkbox" : "button"}
      aria-checked={selectMode ? selected : undefined}
      tabIndex={0}
      className={cn(
        "group relative cursor-pointer overflow-hidden border-border/70 py-0 transition hover:border-primary/40 hover:shadow-md",
        dropHover && "border-primary/50 bg-primary/10 ring-2 ring-primary/40",
        selectMode && selected && "border-primary/60 bg-primary/10",
      )}
      onClick={() => {
        if (selectMode) onToggleSelect(folder.id);
        else onOpen(folder);
      }}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          if (selectMode) onToggleSelect(folder.id);
          else onOpen(folder);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOver(folder.id)(e);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const entryId = e.dataTransfer.getData(DND_ENTRY_MIME);
        if (entryId) onDropEntry(folder.id, entryId);
      }}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-amber-500/80" aria-hidden />
      <div className="flex items-start gap-3 py-4 pl-4 pr-3">
        {selectMode ? (
          <input
            type="checkbox"
            checked={selected}
            readOnly
            className="mt-2 h-4 w-4 shrink-0 accent-primary"
            aria-label={`เลือก ${folder.name}`}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(folder.id)}
          />
        ) : null}
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400"
          aria-hidden
        >
          <Folder className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-snug">{folder.name}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta}</p>
        </div>
        {!selectMode ? (
          <div className="flex shrink-0 gap-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onRename(folder);
              }}
            >
              เปลี่ยนชื่อ
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(folder);
              }}
            >
              ลบ
            </button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
