import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, FileText, KeyRound, MoreVertical } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { VaultData, VaultEntry } from "./types";
import { sealVault, unlockVault, type StoredBlob } from "./storage";

function newId(): string {
  return crypto.randomUUID();
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwModalError, setPwModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<{ imported: VaultData; blob: StoredBlob } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setData(initialData);
    setActiveId(null);
  }, [initialData]);

  const persist = useCallback(
    async (next: VaultData, pw: string) => {
      await onPersist(next, pw);
    },
    [onPersist]
  );

  const scheduleSave = useCallback(
    (next: VaultData, pw: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persist(next, pw).catch(() => {
          setToast("Could not save — check connection or storage.");
        });
      }, 400);
    },
    [persist]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const handleLock = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onLock();
  };

  const updateEntry = (id: string, patch: Partial<VaultEntry>) => {
    const next: VaultData = {
      ...data,
      entries: data.entries.map((en) =>
        en.id === id ? { ...en, ...patch, updatedAt: Date.now() } : en
      ),
    };
    setData(next);
    scheduleSave(next, vaultPassword);
  };

  const addEntry = (type: VaultEntry["type"]) => {
    const id = newId();
    const base: VaultEntry = {
      id,
      type,
      title: type === "note" ? "Untitled note" : "Untitled login",
      updatedAt: Date.now(),
      content: type === "note" ? "" : undefined,
      url: type === "login" ? "" : undefined,
      username: type === "login" ? "" : undefined,
      password: type === "login" ? "" : undefined,
    };
    const next = { ...data, entries: [base, ...data.entries] };
    setData(next);
    setActiveId(id);
    scheduleSave(next, vaultPassword);
  };

  const confirmDelete = () => {
    if (!activeId) return;
    const next = { ...data, entries: data.entries.filter((e) => e.id !== activeId) };
    setData(next);
    setActiveId(null);
    scheduleSave(next, vaultPassword);
    setDeleteOpen(false);
  };

  const exportBackup = async () => {
    try {
      const blob = await sealVault(vaultPassword, data);
      const json = new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" });
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

  const onImportFile: React.ChangeEventHandler<HTMLInputElement> = async (ev) => {
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
    setActiveId(null);
    setImportConfirm(null);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...data.entries].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return list;
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
      return hay.includes(q);
    });
  }, [data, query]);

  const active = data.entries.find((e) => e.id === activeId) ?? null;

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
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await persist(data, vaultPassword);
      await onChangePassword(oldPw, newPw);
      setShowChangePw(false);
      setOldPw("");
      setNewPw("");
      setNewPw2("");
      showToast("Password updated.");
    } catch {
      setPwModalError("Current password is incorrect or update failed.");
    } finally {
      setBusy(false);
    }
  };

  const prominentAddButtons = (opts: { compact?: boolean }) => (
    <div className={opts.compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3"}>
      <Button
        type="button"
        variant="default"
        className={
          opts.compact
            ? "h-14 min-h-[3.5rem] flex-col gap-1 rounded-xl px-2 text-sm font-bold shadow-md"
            : "flex min-h-[3.75rem] flex-col items-center justify-center gap-1 rounded-xl py-4 text-base font-bold shadow-md sm:flex-row sm:gap-3 sm:px-5"
        }
        onClick={() => addEntry("note")}
      >
        <FileText className={opts.compact ? "h-6 w-6" : "h-7 w-7 shrink-0"} aria-hidden />
        <span className="flex flex-col leading-tight">
          <span>โน้ตใหม่</span>
          <span className="text-[0.65rem] font-normal opacity-90 sm:text-xs">เขียนข้อความ</span>
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
        onClick={() => addEntry("login")}
      >
        <KeyRound className={opts.compact ? "h-6 w-6" : "h-7 w-7 shrink-0"} aria-hidden />
        <span className="flex flex-col leading-tight">
          <span>รหัสเว็บ</span>
          <span className="text-[0.65rem] font-normal text-cyan-100/90 sm:text-xs">URL · ชื่อ · พาสเวิร์ด</span>
        </span>
      </Button>
    </div>
  );

  const listToolbar = (
    <div className="flex flex-col gap-4">
      <Input placeholder="ค้นหา…" value={query} onChange={(ev) => setQuery(ev.target.value)} aria-label="ค้นหา" className="min-h-11" />
      <div className="hidden md:block">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">เพิ่มใหม่</p>
        {prominentAddButtons({ compact: false })}
      </div>
    </div>
  );

  const detailToolbar = active ? (
    <div className="sticky top-0 z-30 -mx-4 mb-4 flex items-center gap-2 border-b border-border/70 bg-background/95 px-2 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:mx-0 md:mb-6 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
      <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="กลับไปรายการ" onClick={() => setActiveId(null)}>
        <ChevronLeft className="h-6 w-6" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight md:text-lg">{active.title || "ไม่มีชื่อ"}</p>
        <p className="text-xs text-muted-foreground">{active.type === "login" ? "รหัสผ่าน" : "โน้ต"}</p>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 px-3 py-3 md:px-4">
          <span className="min-w-0 truncate text-lg font-bold tracking-tight">NotANote</span>
          <div className="hidden flex-1 flex-wrap items-center justify-end gap-2 md:flex">
            {topBarExtra}
            <Button type="button" variant="outline" size="sm" onClick={() => setShowChangePw(true)}>
              เปลี่ยนรหัส
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void exportBackup()}>
              ส่งออก
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onPickImport}>
              นำเข้า
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={handleLock}>
              ล็อก
            </Button>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <Button type="button" variant="outline" size="icon" aria-label="เมนูเพิ่มเติม" onClick={() => setMoreOpen(true)}>
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
      </header>

      <main
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 pt-4 md:px-6 md:pt-6",
          activeId ? "pb-4 md:pb-6" : "pb-32 md:pb-6"
        )}
      >
        {!activeId || !active ? (
          <div className="mx-auto max-w-5xl space-y-5">
            {listToolbar}
            {filtered.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center text-muted-foreground">
                  {data.entries.length === 0 ? (
                    <>
                      <p className="text-base">ยังไม่มีรายการ</p>
                      <p className="mt-2 text-sm">ใช้ปุ่มด้านล่าง (มือถือ) หรือปุ่มด้านบน (จอใหญ่) เพื่อเพิ่มโน้ตหรือรหัสเว็บ</p>
                    </>
                  ) : (
                    <p>ไม่พบผลที่ตรงกับการค้นหา</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((e) => (
                  <Card
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer border-border/80 px-4 py-5 transition hover:border-primary/45 hover:shadow-lg active:scale-[0.99] sm:py-6"
                    onClick={() => setActiveId(e.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        setActiveId(e.id);
                      }
                    }}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <CardTitle className="line-clamp-3 min-w-0 flex-1 text-start text-base font-semibold leading-snug sm:text-left">
                        {e.title || "ไม่มีชื่อ"}
                      </CardTitle>
                      <Badge variant={e.type === "login" ? "login" : "default"} className="shrink-0 normal-case tracking-normal">
                        {e.type === "login" ? "รหัสผ่าน" : "โน้ต"}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : active.type === "note" ? (
          <div className="mx-auto max-w-2xl space-y-4">
            {detailToolbar}
            <div className="space-y-2">
              <Label htmlFor="title">หัวข้อ</Label>
              <Input id="title" value={active.title} onChange={(ev) => updateEntry(active.id, { title: ev.target.value })} className="min-h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">เนื้อหา</Label>
              <Textarea
                id="content"
                value={active.content ?? ""}
                onChange={(ev) => updateEntry(active.id, { content: ev.target.value })}
                placeholder="พิมพ์โน้ต…"
              />
            </div>
            <Separator />
            <Button type="button" variant="destructive" size="sm" className="min-h-10" onClick={() => setDeleteOpen(true)}>
              ลบรายการนี้
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {detailToolbar}
            <div className="space-y-2">
              <Label htmlFor="ltitle">หัวข้อ</Label>
              <Input id="ltitle" value={active.title} onChange={(ev) => updateEntry(active.id, { title: ev.target.value })} className="min-h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">URL เว็บ</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Input
                  id="url"
                  className="min-h-11 sm:min-w-0 sm:flex-1"
                  value={active.url ?? ""}
                  onChange={(ev) => updateEntry(active.id, { url: ev.target.value })}
                  placeholder="https://…"
                />
                <Button type="button" variant="secondary" className="min-h-11 shrink-0 sm:w-24" onClick={() => void copyText("URL", active.url ?? "")}>
                  คัดลอก
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user">ชื่อผู้ใช้ / อีเมล</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="user"
                  className="min-h-11 sm:flex-1"
                  value={active.username ?? ""}
                  onChange={(ev) => updateEntry(active.id, { username: ev.target.value })}
                  placeholder="อีเมลหรือชื่อผู้ใช้"
                />
                <Button type="button" variant="secondary" className="min-h-11 shrink-0 sm:w-24" onClick={() => void copyText("Login ID", active.username ?? "")}>
                  คัดลอก
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">รหัสผ่าน</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <PasswordInput
                  id="pass"
                  className="sm:min-w-0 sm:flex-1"
                  value={active.password ?? ""}
                  onChange={(v) => updateEntry(active.id, { password: v })}
                  autoComplete="new-password"
                  resetKey={active.id}
                />
                <Button type="button" variant="secondary" className="min-h-11 shrink-0 sm:w-24" onClick={() => void copyText("Password", active.password ?? "")}>
                  คัดลอก
                </Button>
              </div>
            </div>
            <Separator />
            <Button type="button" variant="destructive" size="sm" className="min-h-10" onClick={() => setDeleteOpen(true)}>
              ลบรายการนี้
            </Button>
          </div>
        )}
      </main>

      {toast ? (
        <div
          className={cn(
            "fixed left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg",
            activeId ? "bottom-4" : "bottom-[5.5rem] md:bottom-4"
          )}
        >
          {toast}
        </div>
      ) : null}

      {!activeId ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md md:hidden">
          <p className="mb-2 text-center text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">เพิ่มใหม่</p>
          {prominentAddButtons({ compact: true })}
        </div>
      ) : null}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl border-border/80 p-0">
          <div className="flex justify-center pt-3">
            <div className="h-1.5 w-12 rounded-full bg-muted" />
          </div>
          <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-2 text-left">
            <SheetTitle>เมนู</SheetTitle>
            <SheetDescription className="sr-only">บัญชีและการสำรองข้อมูล</SheetDescription>
          </SheetHeader>
          <div className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto px-2 py-3">
            {topBarExtra ? (
              <div className="flex flex-col gap-2 border-b border-border/60 px-2 pb-3">{topBarExtra}</div>
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

      <Dialog open={showChangePw} onOpenChange={(o) => !busy && setShowChangePw(o)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" onPointerDownOutside={(e) => busy && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>Re-encrypts your vault. In cloud mode your sign-in password is updated too.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitChangePw} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opw">Current password</Label>
              <PasswordInput id="opw" value={oldPw} onChange={setOldPw} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw">New password</Label>
              <PasswordInput id="npw" value={newPw} onChange={setNewPw} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw2">Confirm new password</Label>
              <PasswordInput id="npw2" value={newPw2} onChange={setNewPw2} required />
            </div>
            {pwModalError ? <p className="text-sm text-destructive">{pwModalError}</p> : null}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setShowChangePw(false)} disabled={busy}>
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
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!importConfirm} onOpenChange={(o) => !o && setImportConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace vault with backup?</AlertDialogTitle>
            <AlertDialogDescription>Unsaved changes on this device will be lost unless you exported them first.</AlertDialogDescription>
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
