import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, KeyRound, MoreVertical } from "lucide-react";
import { PasswordInput } from "@/components/PasswordInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { VaultData, VaultEntry } from "./types";
import { sealVault, unlockVault, type StoredBlob } from "./storage";

type VaultEntryType = VaultEntry["type"];

function newId(): string {
  return crypto.randomUUID();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function entriesEqual(a: VaultEntry | null, b: VaultEntry | null): boolean {
  if (!a || !b || a.id !== b.id) return false;
  return (
    a.title === b.title &&
    (a.content ?? "") === (b.content ?? "") &&
    (a.url ?? "") === (b.url ?? "") &&
    (a.username ?? "") === (b.username ?? "") &&
    (a.password ?? "") === (b.password ?? "")
  );
}

function cloneEntry(e: VaultEntry): VaultEntry {
  return JSON.parse(JSON.stringify(e)) as VaultEntry;
}

function previewLine(e: VaultEntry): string {
  if (e.type === "note") {
    const line = (e.content ?? "").split("\n")[0]?.trim() ?? "";
    if (!line) return "";
    return line.length > 100 ? `${line.slice(0, 100)}…` : line;
  }
  const raw = e.url?.trim() ?? "";
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname;
  } catch {
    return raw.slice(0, 80);
  }
}

function HighlightText({ text, needle }: { text: string; needle: string }) {
  const q = needle.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded bg-primary/30 px-0.5 text-inherit dark:bg-primary/40"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export type VaultShellProps = {
  vaultPassword: string;
  initialData: VaultData;
  onPersist: (data: VaultData, password: string) => Promise<void>;
  onChangePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  onImportReplace: (imported: VaultData, blob: StoredBlob) => Promise<void>;
  onLock: () => void;
  topBarExtra?: React.ReactNode;
};

const IDLE_LOCK_MS = 5 * 60 * 1000;

export function VaultShell({
  vaultPassword,
  initialData,
  onPersist,
  onChangePassword,
  onImportReplace,
  onLock,
  topBarExtra,
}: VaultShellProps) {
  const [data, setData] = useState<VaultData>(initialData);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | VaultEntryType>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwModalError, setPwModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<{
    imported: VaultData;
    blob: StoredBlob;
  } | null>(null);

  type SyncStatus = "idle" | "saving" | "saved" | "error";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const savedHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Draft for “create new” modal — not persisted until user clicks บันทึก. */
  const [createModal, setCreateModal] = useState<{
    type: VaultEntry["type"];
    title: string;
    content: string;
    url: string;
    username: string;
    password: string;
  } | null>(null);

  /** Edit modal: baseline vs draft for dirty detection. */
  const [editBaseline, setEditBaseline] = useState<VaultEntry | null>(null);
  const [editDraft, setEditDraft] = useState<VaultEntry | null>(null);
  const [editDiscardOpen, setEditDiscardOpen] = useState(false);

  const createTitleRef = useRef<HTMLInputElement>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);
  const createModalWasOpenRef = useRef(false);
  const editModalWasOpenRef = useRef(false);

  useEffect(() => {
    setData(initialData);
    setEditDraft(null);
    setEditBaseline(null);
  }, [initialData]);

  const persist = useCallback(
    async (next: VaultData, pw: string) => {
      await onPersist(next, pw);
    },
    [onPersist],
  );

  const clearSavedHideTimer = () => {
    if (savedHideTimer.current) {
      clearTimeout(savedHideTimer.current);
      savedHideTimer.current = null;
    }
  };

  const persistWithFeedback = useCallback(
    async (next: VaultData) => {
      clearSavedHideTimer();
      setSyncStatus("saving");
      try {
        await persist(next, vaultPassword);
        setSyncStatus("saved");
        savedHideTimer.current = setTimeout(() => {
          setSyncStatus("idle");
          savedHideTimer.current = null;
        }, 2200);
      } catch {
        setSyncStatus("error");
      }
    },
    [persist, vaultPassword],
  );

  const retryPersist = useCallback(() => {
    void persistWithFeedback(data);
  }, [data, persistWithFeedback]);

  useEffect(() => {
    return () => clearSavedHideTimer();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const handleLock = useCallback(() => {
    clearSavedHideTimer();
    setSyncStatus("idle");
    onLock();
  }, [onLock]);

  const handleLockRef = useRef(handleLock);
  handleLockRef.current = handleLock;

  /** Auto-lock after 5 minutes without pointer / key / touch activity. */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        showToast("ล็อกอัตโนมัติหลังไม่ใช้งาน 5 นาที");
        handleLockRef.current();
      }, IDLE_LOCK_MS);
    };
    schedule();
    const onActivity = () => schedule();
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("mousedown", onActivity, opts);
    window.addEventListener("keydown", onActivity, opts);
    window.addEventListener("touchstart", onActivity, opts);
    document.addEventListener("scroll", onActivity, true);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("mousedown", onActivity, opts);
      window.removeEventListener("keydown", onActivity, opts);
      window.removeEventListener("touchstart", onActivity, opts);
      document.removeEventListener("scroll", onActivity, true);
    };
  }, [showToast]);

  useEffect(() => {
    const open = createModal !== null;
    if (!open) {
      createModalWasOpenRef.current = false;
      return;
    }
    if (!createModalWasOpenRef.current) {
      createModalWasOpenRef.current = true;
      const id = requestAnimationFrame(() => {
        createTitleRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [createModal]);

  useEffect(() => {
    const open = editDraft !== null;
    if (!open) {
      editModalWasOpenRef.current = false;
      return;
    }
    if (!editModalWasOpenRef.current) {
      editModalWasOpenRef.current = true;
      const id = requestAnimationFrame(() => {
        editTitleRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [editDraft]);

  const openCreateModal = (type: VaultEntry["type"]) => {
    setCreateModal({
      type,
      title: type === "note" ? "" : "",
      content: "",
      url: "",
      username: "",
      password: "",
    });
  };

  const submitCreateModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createModal) return;
    const id = newId();
    const titleTrim = createModal.title.trim();
    const base: VaultEntry =
      createModal.type === "note"
        ? {
            id,
            type: "note",
            title: titleTrim || "",
            updatedAt: Date.now(),
            content: createModal.content,
          }
        : {
            id,
            type: "login",
            title: titleTrim || "",
            updatedAt: Date.now(),
            url: createModal.url,
            username: createModal.username,
            password: createModal.password,
          };
    const next = { ...data, entries: [base, ...data.entries] };
    setData(next);
    setCreateModal(null);
    void persistWithFeedback(next);
    showToast("บันทึกแล้ว");
  };

  const openEditModal = (entry: VaultEntry) => {
    setEditBaseline(cloneEntry(entry));
    setEditDraft(cloneEntry(entry));
  };

  const requestCloseEditModal = () => {
    if (!editDraft || !editBaseline) {
      setEditDraft(null);
      setEditBaseline(null);
      return;
    }
    if (!entriesEqual(editBaseline, editDraft)) {
      setEditDiscardOpen(true);
    } else {
      setEditDraft(null);
      setEditBaseline(null);
    }
  };

  const confirmDiscardEdit = () => {
    setEditDiscardOpen(false);
    setEditDraft(null);
    setEditBaseline(null);
  };

  const submitEditModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;
    const titleTrim = editDraft.title.trim();
    const merged: VaultEntry =
      editDraft.type === "note"
        ? {
            ...editDraft,
            title: titleTrim || "",
            updatedAt: Date.now(),
          }
        : {
            ...editDraft,
            title: titleTrim || "",
            updatedAt: Date.now(),
          };
    const next: VaultData = {
      ...data,
      entries: data.entries.map((en) => (en.id === merged.id ? merged : en)),
    };
    setData(next);
    setEditDraft(null);
    setEditBaseline(null);
    void persistWithFeedback(next);
    showToast("บันทึกแล้ว");
  };

  const confirmDelete = () => {
    const id = editDraft?.id;
    if (!id) return;
    const next = { ...data, entries: data.entries.filter((e) => e.id !== id) };
    setData(next);
    setDeleteOpen(false);
    setEditDraft(null);
    setEditBaseline(null);
    void persistWithFeedback(next);
    showToast("ลบแล้ว");
  };

  const exportBackup = async () => {
    try {
      const blob = await sealVault(vaultPassword, data);
      const json = new Blob([JSON.stringify(blob, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(json);
      a.download = `notanote-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Encrypted backup downloaded.");
    } catch {
      showToast("Export failed.");
    }
  };

  const importInputRef = useRef<HTMLInputElement>(null);
  const onPickImport = () => importInputRef.current?.click();

  const onImportFile: React.ChangeEventHandler<HTMLInputElement> = async (
    ev,
  ) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as StoredBlob;
      if (!parsed.saltB64 || !parsed.payloadB64) throw new Error("bad");
      const imported = await unlockVault(vaultPassword, parsed);
      setImportConfirm({ imported, blob: parsed });
    } catch {
      showToast("Import failed — wrong password or invalid file.");
    }
  };

  const applyImport = async () => {
    if (!importConfirm) return;
    await onImportReplace(importConfirm.imported, importConfirm.blob);
    setData(importConfirm.imported);
    setEditDraft(null);
    setEditBaseline(null);
    setImportConfirm(null);
    clearSavedHideTimer();
    setSyncStatus("idle");
    showToast("Backup restored.");
  };

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} copied`);
    } catch {
      showToast("Clipboard not available.");
    }
  };

  const qLower = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    let list = [...data.entries].sort((a, b) => b.updatedAt - a.updatedAt);
    if (filterType !== "all") {
      list = list.filter((e) => e.type === filterType);
    }
    if (!qLower) return list;
    return list.filter((e) => {
      const hay = [
        e.title,
        e.content,
        e.url,
        e.username,
        e.type === "login" ? "login" : "note",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qLower);
    });
  }, [data, qLower, filterType]);

  const submitChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwModalError(null);
    if (newPw.length < 8) {
      setPwModalError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== newPw2) {
      setPwModalError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await persist(data, vaultPassword);
      await onChangePassword(oldPw, newPw);
      setShowChangePw(false);
      setOldPw("");
      setNewPw("");
      setNewPw2("");
      setSyncStatus("idle");
      clearSavedHideTimer();
      showToast("Password updated.");
    } catch {
      setPwModalError("Current password is incorrect or update failed.");
    } finally {
      setBusy(false);
    }
  };

  const syncLabel =
    syncStatus === "saving"
      ? "กำลังบันทึก…"
      : syncStatus === "saved"
        ? "บันทึกแล้ว"
        : syncStatus === "error"
          ? "บันทึกไม่สำเร็จ"
          : null;

  const filterButtons = (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/30 p-1 justify-between">
      {(
        [
          ["all", "ทั้งหมด"],
          ["note", "โน้ต"],
          ["login", "รหัสเว็บ"],
        ] as const
      ).map(([value, label]) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={filterType === value ? "secondary" : "ghost"}
          className="h-9 flex-1 sm:flex-none w-[30%]"
          onClick={() => setFilterType(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );

  const prominentAddButtons = (opts: { compact?: boolean }) => (
    <div
      className={
        opts.compact
          ? "grid grid-cols-2 gap-2"
          : "grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3"
      }
    >
      <Button
        type="button"
        variant="default"
        className={
          opts.compact
            ? "h-14 min-h-[3.5rem] flex-col gap-1 rounded-xl px-2 text-sm font-bold shadow-md"
            : "flex min-h-[3.75rem] flex-col items-center justify-center gap-1 rounded-xl py-4 text-base font-bold shadow-md sm:flex-row sm:gap-3 sm:px-5"
        }
        onClick={() => openCreateModal("note")}
      >
        <FileText
          className={opts.compact ? "h-6 w-6" : "h-7 w-7 shrink-0"}
          aria-hidden
        />
        <span className="flex flex-col leading-tight">
          <span>โน้ตใหม่</span>
          <span className="text-[0.65rem] font-normal opacity-90 sm:text-xs">
            เขียนข้อความ
          </span>
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        className={
          opts.compact
            ? "h-14 min-h-[3.5rem] flex-col gap-1 rounded-xl border-2 border-cyan-400/70 bg-cyan-950/50 px-2 text-sm font-bold text-cyan-50 shadow-md hover:bg-cyan-900/60"
            : "flex min-h-[3.75rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-cyan-400/70 bg-cyan-950/40 py-4 text-base font-bold text-cyan-50 shadow-md hover:bg-cyan-900/50 sm:flex-row sm:gap-3 sm:px-5"
        }
        onClick={() => openCreateModal("login")}
      >
        <KeyRound
          className={opts.compact ? "h-6 w-6" : "h-7 w-7 shrink-0"}
          aria-hidden
        />
        <span className="flex flex-col leading-tight">
          <span>รหัสเว็บ</span>
          <span className="text-[0.65rem] font-normal text-cyan-100/90 sm:text-xs">
            URL · ชื่อ · พาสเวิร์ด
          </span>
        </span>
      </Button>
    </div>
  );

  const listToolbar = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="vault-search" className="text-muted-foreground">
            ค้นหา
          </Label>
          <Input
            id="vault-search"
            placeholder="ค้นหา…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            aria-label="ค้นหา"
            className="min-h-11"
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[280px]">{filterButtons}</div>
      </div>
      <div className="hidden md:block">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          เพิ่มใหม่
        </p>
        {prominentAddButtons({ compact: false })}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 truncate text-lg font-bold tracking-tight">
              NotANote
            </span>
            {syncLabel ? (
              <span
                className={cn(
                  "text-xs font-medium",
                  syncStatus === "error"
                    ? "text-destructive"
                    : syncStatus === "saved"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                )}
              >
                {syncLabel}
              </span>
            ) : null}
            {syncStatus === "error" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void retryPersist()}
              >
                ลองอีกครั้ง
              </Button>
            ) : null}
          </div>
          <div className="hidden flex-1 flex-wrap items-center justify-end gap-2 md:flex">
            {topBarExtra}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowChangePw(true)}
            >
              เปลี่ยนรหัส
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void exportBackup()}
            >
              ส่งออก
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPickImport}
            >
              นำเข้า
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleLock}
            >
              ล็อก
            </Button>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 md:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="เมนูเพิ่มเติม"
              onClick={() => setMoreOpen(true)}
            >
              <MoreVertical className="h-5 w-5" />
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

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4 md:px-6 md:pb-6 md:pt-6">
        <div className="mx-auto max-w-5xl space-y-5">
          {listToolbar}
          {filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                {data.entries.length === 0 ? (
                  <>
                    <p className="text-base">ยังไม่มีรายการ</p>
                    <p className="mt-2 text-sm">
                      ใช้ปุ่มด้านล่าง (มือถือ) หรือปุ่มด้านบน (จอใหญ่)
                      เพื่อเพิ่มโน้ตหรือรหัสเว็บ
                    </p>
                  </>
                ) : (
                  <p>ไม่พบผลที่ตรงกับการค้นหาหรือตัวกรอง</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((e) => {
                const prev = previewLine(e);
                const titleDisplay = e.title || "ไม่มีชื่อ";
                return (
                  <Card
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer border-border/80 px-4 py-5 transition hover:border-primary/45 hover:shadow-lg active:scale-[0.99] sm:py-6"
                    onClick={() => openEditModal(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        openEditModal(e);
                      }
                    }}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <CardTitle className="line-clamp-3 min-w-0 flex-1 text-start text-base font-semibold leading-snug sm:text-left">
                        <HighlightText
                          text={titleDisplay}
                          needle={query.trim()}
                        />
                      </CardTitle>
                      <Badge
                        variant={e.type === "login" ? "login" : "default"}
                        className="shrink-0 normal-case tracking-normal"
                      >
                        {e.type === "login" ? "รหัสผ่าน" : "โน้ต"}
                      </Badge>
                    </div>
                    {prev ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        <HighlightText text={prev} needle={query.trim()} />
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {toast ? (
        <div className="fixed bottom-[5.5rem] left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg md:bottom-4">
          {toast}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md md:hidden">
        <p className="mb-2 text-center text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
          เพิ่มใหม่
        </p>
        {prominentAddButtons({ compact: true })}
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] rounded-t-2xl border-border/80 p-0"
        >
          <div className="flex justify-center pt-3">
            <div className="h-1.5 w-12 rounded-full bg-muted" />
          </div>
          <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-2 text-left">
            <SheetTitle>เมนู</SheetTitle>
            <SheetDescription className="sr-only">
              บัญชีและการสำรองข้อมูล
            </SheetDescription>
          </SheetHeader>
          <div className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto px-2 py-3">
            {topBarExtra ? (
              <div className="flex flex-col gap-2 border-b border-border/60 px-2 pb-3">
                {topBarExtra}
              </div>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="h-12 justify-start text-base"
              onClick={() => {
                setShowChangePw(true);
                setMoreOpen(false);
              }}
            >
              เปลี่ยนรหัสผ่าน
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12 justify-start text-base"
              onClick={() => {
                void exportBackup();
                setMoreOpen(false);
              }}
            >
              ส่งออกสำรอง (.json)
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12 justify-start text-base"
              onClick={() => {
                onPickImport();
                setMoreOpen(false);
              }}
            >
              นำเข้าสำรอง
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="mx-2 mt-2 h-12 text-base"
              onClick={() => {
                handleLock();
                setMoreOpen(false);
              }}
            >
              ล็อกหน้าจอ
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={createModal !== null}
        onOpenChange={(open) => {
          if (!open) setCreateModal(null);
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {createModal ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6 text-left">
                <DialogTitle>
                  {createModal.type === "note" ? "โน้ตใหม่" : "รหัสเว็บใหม่"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {createModal.type === "note"
                    ? "กรอกหัวข้อและเนื้อหา แล้วกดบันทึก"
                    : "กรอกข้อมูลล็อกอิน แล้วกดบันทึก"}
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={submitCreateModal}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-title">หัวข้อ</Label>
                      <Input
                        ref={createTitleRef}
                        id="create-title"
                        value={createModal.title}
                        onChange={(ev) =>
                          setCreateModal((d) =>
                            d ? { ...d, title: ev.target.value } : d,
                          )
                        }
                        className="min-h-11"
                        placeholder="Unititled Note"
                      />
                    </div>
                    {createModal.type === "note" ? (
                      <div className="space-y-2">
                        <Label htmlFor="create-content">เนื้อหา</Label>
                        <Textarea
                          id="create-content"
                          value={createModal.content}
                          onChange={(ev) =>
                            setCreateModal((d) =>
                              d ? { ...d, content: ev.target.value } : d,
                            )
                          }
                          placeholder="พิมพ์โน้ต…"
                          className="min-h-[140px]"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="create-url">URL เว็บ</Label>
                          <Input
                            id="create-url"
                            className="min-h-11"
                            value={createModal.url}
                            onChange={(ev) =>
                              setCreateModal((d) =>
                                d ? { ...d, url: ev.target.value } : d,
                              )
                            }
                            placeholder="https://…"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create-user">
                            ชื่อผู้ใช้ / อีเมล
                          </Label>
                          <Input
                            id="create-user"
                            className="min-h-11"
                            value={createModal.username}
                            onChange={(ev) =>
                              setCreateModal((d) =>
                                d ? { ...d, username: ev.target.value } : d,
                              )
                            }
                            placeholder="อีเมลหรือชื่อผู้ใช้"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="create-pass">รหัสผ่าน</Label>
                          <PasswordInput
                            id="create-pass"
                            value={createModal.password}
                            onChange={(v) =>
                              setCreateModal((d) =>
                                d ? { ...d, password: v } : d,
                              )
                            }
                            autoComplete="new-password"
                            resetKey={
                              createModal.type === "login"
                                ? "create-login-draft"
                                : "closed"
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-6 py-4 ">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateModal(null)}
                  >
                    ยกเลิก
                  </Button>
                  <Button type="submit">บันทึก</Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDraft !== null}
        onOpenChange={(open) => {
          if (!open) requestCloseEditModal();
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {editDraft ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6 text-left">
                <DialogTitle>
                  {editDraft.type === "note" ? "แก้ไขโน้ต" : "แก้ไขรหัสเว็บ"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  แก้ไขแล้วกดบันทึก — ปิดโดยไม่บันทึกจะสูญการเปลี่ยนแปลง
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={submitEditModal}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-title">หัวข้อ</Label>
                      <Input
                        ref={editTitleRef}
                        id="edit-title"
                        value={editDraft.title}
                        onChange={(ev) =>
                          setEditDraft((d) =>
                            d ? { ...d, title: ev.target.value } : d,
                          )
                        }
                        className="min-h-11"
                        placeholder="Untitled login"
                      />
                    </div>
                    {editDraft.type === "note" ? (
                      <div className="space-y-2">
                        <Label htmlFor="edit-content">เนื้อหา</Label>
                        <Textarea
                          id="edit-content"
                          value={editDraft.content ?? ""}
                          onChange={(ev) =>
                            setEditDraft((d) =>
                              d ? { ...d, content: ev.target.value } : d,
                            )
                          }
                          placeholder="พิมพ์โน้ต…"
                          className="min-h-[140px]"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="edit-url">URL เว็บ</Label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                            <Input
                              id="edit-url"
                              className="min-h-11 sm:min-w-0 sm:flex-1"
                              value={editDraft.url ?? ""}
                              onChange={(ev) =>
                                setEditDraft((d) =>
                                  d ? { ...d, url: ev.target.value } : d,
                                )
                              }
                              placeholder="https://…"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-11 shrink-0 sm:w-24"
                              onClick={() =>
                                void copyText("URL", editDraft.url ?? "")
                              }
                            >
                              คัดลอก
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-user">ชื่อผู้ใช้ / อีเมล</Label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              id="edit-user"
                              className="min-h-11 sm:flex-1"
                              value={editDraft.username ?? ""}
                              onChange={(ev) =>
                                setEditDraft((d) =>
                                  d ? { ...d, username: ev.target.value } : d,
                                )
                              }
                              placeholder="อีเมลหรือชื่อผู้ใช้"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-11 shrink-0 sm:w-24"
                              onClick={() =>
                                void copyText(
                                  "Login ID",
                                  editDraft.username ?? "",
                                )
                              }
                            >
                              คัดลอก
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-pass">รหัสผ่าน</Label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                            <PasswordInput
                              id="edit-pass"
                              className="sm:min-w-0 sm:flex-1"
                              value={editDraft.password ?? ""}
                              onChange={(v) =>
                                setEditDraft((d) =>
                                  d ? { ...d, password: v } : d,
                                )
                              }
                              autoComplete="new-password"
                              resetKey={editDraft.id}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-11 shrink-0 sm:w-24"
                              onClick={() =>
                                void copyText(
                                  "Password",
                                  editDraft.password ?? "",
                                )
                              }
                            >
                              คัดลอก
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full sm:mr-auto sm:w-auto"
                    onClick={() => setDeleteOpen(true)}
                  >
                    ลบรายการนี้
                  </Button>
                  <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 flex-1 sm:flex-none"
                      onClick={() => requestCloseEditModal()}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      type="submit"
                      className="min-h-11 flex-1 sm:flex-none"
                    >
                      บันทึก
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={editDiscardOpen} onOpenChange={setEditDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ทิ้งการแก้ไข?</AlertDialogTitle>
            <AlertDialogDescription>
              การเปลี่ยนแปลงยังไม่ถูกบันทึก
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>กลับไปแก้ไข</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardEdit}>
              ทิ้ง
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showChangePw}
        onOpenChange={(o) => !busy && setShowChangePw(o)}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
          onPointerDownOutside={(e) => busy && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Re-encrypts your vault. In cloud mode your sign-in password is
              updated too.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitChangePw} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opw">Current password</Label>
              <PasswordInput
                id="opw"
                value={oldPw}
                onChange={setOldPw}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw">New password</Label>
              <PasswordInput
                id="npw"
                value={newPw}
                onChange={setNewPw}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw2">Confirm new password</Label>
              <PasswordInput
                id="npw2"
                value={newPw2}
                onChange={setNewPw2}
                required
              />
            </div>
            {pwModalError ? (
              <p className="text-sm text-destructive">{pwModalError}</p>
            ) : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowChangePw(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!importConfirm}
        onOpenChange={(o) => !o && setImportConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace vault with backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved changes on this device will be lost unless you exported
              them first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                void applyImport();
              }}
            >
              Replace
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
