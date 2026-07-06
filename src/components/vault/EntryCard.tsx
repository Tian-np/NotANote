import { useRef } from "react";
import { FileText, GripVertical, KeyRound, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VaultEntry } from "@/types";
import { DND_ENTRY_MIME, HighlightText, previewLine } from "./vaultUtils";

const LOCKED_TITLE = "รายการที่ล็อกไว้";

type EntryCardProps = {
  entry: VaultEntry;
  query: string;
  ungrouped: boolean;
  folderPath?: string;
  isLockedDisplay: boolean;
  onOpen: (entry: VaultEntry) => void;
};

export function EntryCard({
  entry,
  query,
  ungrouped,
  folderPath,
  isLockedDisplay,
  onOpen,
}: EntryCardProps) {
  const draggingRef = useRef(false);
  const prev = isLockedDisplay ? "" : previewLine(entry);
  const titleDisplay = isLockedDisplay ? LOCKED_TITLE : entry.title || "ไม่มีชื่อ";
  const isLogin = entry.type === "login";

  const handleDragStart = (ev: React.DragEvent) => {
    draggingRef.current = true;
    ev.dataTransfer.setData(DND_ENTRY_MIME, entry.id);
    ev.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    requestAnimationFrame(() => {
      draggingRef.current = false;
    });
  };

  const handleClick = () => {
    if (draggingRef.current) return;
    onOpen(entry);
  };

  return (
    <Card
      draggable
      role="button"
      tabIndex={0}
      id={`vault-entry-card-${entry.id}`}
      data-cy={`vault-entry-card-${entry.id}`}
      className={cn(
        "group relative cursor-grab overflow-hidden border-border/70 py-0 pl-0 pr-4 transition hover:border-primary/40 hover:shadow-md active:cursor-grabbing active:scale-[0.99]",
        ungrouped && "border-dashed border-muted-foreground/30",
        isLogin ? "hover:border-login/50" : "hover:border-note/50",
        isLockedDisplay && "border-muted-foreground/40",
      )}
      title="ลากไปวางในหมวด"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen(entry);
        }
      }}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          isLockedDisplay ? "bg-muted-foreground/50" : isLogin ? "bg-login" : "bg-note",
        )}
        aria-hidden
      />
      <div className="flex gap-1 py-4 pl-3 sm:py-5">
        <span
          className="shrink-0 self-center p-1.5 text-muted-foreground/60"
          aria-hidden
        >
          {isLockedDisplay ? (
            <Lock className="h-5 w-5" />
          ) : (
            <GripVertical className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                isLockedDisplay
                  ? "bg-muted text-muted-foreground"
                  : isLogin
                    ? "bg-login/15 text-login"
                    : "bg-note/15 text-note",
              )}
              aria-hidden
            >
              {isLockedDisplay ? (
                <Lock className="h-4 w-4" />
              ) : isLogin ? (
                <KeyRound className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 min-w-0 flex-1 text-start text-base font-semibold leading-snug">
                  <HighlightText text={titleDisplay} needle={query.trim()} />
                </h3>
                <Badge
                  variant={isLockedDisplay ? "outline" : isLogin ? "login" : "note"}
                  className="shrink-0"
                >
                  {isLockedDisplay ? "ล็อก" : isLogin ? "รหัสเว็บ" : "โน้ต"}
                </Badge>
              </div>
              {prev ? (
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                  <HighlightText text={prev} needle={query.trim()} />
                </p>
              ) : isLockedDisplay ? (
                <p className="mt-1.5 text-sm text-muted-foreground">แตะเพื่อใส่ PIN</p>
              ) : null}
              {folderPath && !isLockedDisplay ? (
                <p className="mt-1 text-xs text-muted-foreground/80">{folderPath}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
