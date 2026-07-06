import { ChevronRight, FolderPlus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VaultFolder } from "@/types";

type FolderBreadcrumbProps = {
  ancestors: VaultFolder[];
  atRoot: boolean;
  selectMode: boolean;
  selectedCount: number;
  onNavigate: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onToggleSelectMode: () => void;
  onDeleteSelected: () => void;
};

export function FolderBreadcrumb({
  ancestors,
  atRoot,
  selectMode,
  selectedCount,
  onNavigate,
  onCreateFolder,
  onToggleSelectMode,
  onDeleteSelected,
}: FolderBreadcrumbProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="ตำแหน่งหมวด" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          className={cn(
            "rounded-md px-2 py-1 font-medium transition hover:bg-muted",
            atRoot ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onNavigate(null)}
        >
          หน้าหลัก
        </button>
        {ancestors.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <button
              type="button"
              className={cn(
                "max-w-[160px] truncate rounded-md px-2 py-1 font-medium transition hover:bg-muted sm:max-w-[220px]",
                f.id === ancestors[ancestors.length - 1]?.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onNavigate(f.id)}
            >
              {f.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        {selectMode ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={selectedCount === 0}
              onClick={onDeleteSelected}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              ลบที่เลือก ({selectedCount})
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onToggleSelectMode}>
              <X className="h-4 w-4" aria-hidden />
              ยกเลิก
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" onClick={onToggleSelectMode}>
              เลือกหลายหมวด
            </Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={onCreateFolder}>
              <FolderPlus className="h-4 w-4" aria-hidden />
              {atRoot ? "สร้างหมวด" : "สร้างหมวดย่อย"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
