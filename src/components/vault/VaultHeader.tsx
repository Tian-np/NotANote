import { FileText, KeyRound, MoreVertical, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VaultEntry } from "@/types";

type SyncStatus = "idle" | "saving" | "saved" | "error";

type VaultHeaderProps = {
  syncStatus: SyncStatus;
  syncLabel: string | null;
  onRetryPersist: () => void;
  onChangePassword: () => void;
  onExport: () => void;
  onImport: () => void;
  onLock: () => void;
  onCreateNote: () => void;
  onCreateLogin: () => void;
  onOpenMore: () => void;
  topBarExtra?: React.ReactNode;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onImportFile: React.ChangeEventHandler<HTMLInputElement>;
};

function SyncIndicator({ status, label }: { status: SyncStatus; label: string | null }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        status === "error"
          ? "text-destructive"
          : status === "saved"
            ? "text-success"
            : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "error"
            ? "bg-destructive"
            : status === "saved"
              ? "bg-success"
              : status === "saving"
                ? "animate-pulse bg-primary"
                : "bg-muted-foreground",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function VaultHeader({
  syncStatus,
  syncLabel,
  onRetryPersist,
  onChangePassword,
  onExport,
  onImport,
  onLock,
  onCreateNote,
  onCreateLogin,
  onOpenMore,
  topBarExtra,
  importInputRef,
  onImportFile,
}: VaultHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-center md:justify-between md:gap-4 md:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Shield className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 truncate text-lg font-bold tracking-tight">
              NotANote
            </span>
          </div>
          <SyncIndicator status={syncStatus} label={syncLabel} />
          {syncStatus === "error" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onRetryPersist}
            >
              ลองอีกครั้ง
            </Button>
          ) : null}
        </div>

        <div className="hidden flex-1 flex-wrap items-center justify-end gap-2 md:flex">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={onCreateNote}
          >
            <FileText className="h-4 w-4" aria-hidden />
            โน้ตใหม่
          </Button>
          <Button
            type="button"
            variant="login"
            size="sm"
            className="gap-1.5"
            onClick={onCreateLogin}
          >
            <KeyRound className="h-4 w-4" aria-hidden />
            รหัสเว็บ
          </Button>
          <div className="mx-1 h-6 w-px bg-border/80" aria-hidden />
          {topBarExtra}
          <Button type="button" variant="outline" size="sm" onClick={onChangePassword}>
            เปลี่ยนรหัส
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onExport}>
            ส่งออก
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onImport}>
            นำเข้า
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onLock}>
            ล็อก
          </Button>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="เมนูเพิ่มเติม"
            onClick={onOpenMore}
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </div>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onImportFile}
      />
    </header>
  );
}
