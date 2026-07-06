import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { AddEntryFab } from "@/components/vault/AddEntryFab";
import { EmptyState } from "@/components/vault/EmptyState";
import { EntryCard } from "@/components/vault/EntryCard";
import { FolderSidebar } from "@/components/vault/FolderSidebar";
import { FolderBreadcrumb } from "@/components/vault/FolderBreadcrumb";
import { FolderCard } from "@/components/vault/FolderCard";
import { VaultHeader } from "@/components/vault/VaultHeader";
import { VaultToast } from "@/components/vault/VaultToast";
import { VaultToolbar } from "@/components/vault/VaultToolbar";
import {
  DND_ENTRY_MIME,
  selectLikeClass,
} from "@/components/vault/vaultUtils";
import {
  ancestorsOf,
  childrenOf,
  countEntriesInFolder,
  folderPathLabel,
  folderSelectOptions,
  hasChildFolders,
  isValidParentId,
} from "./folderUtils";
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
import { Button } from "@/components/ui/button";
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
import type { VaultData, VaultEntry, VaultFolder } from "./types";
import {
  applySecretsToEntry,
  createLockPinConfig,
  deriveLockKey,
  isEntryLocked,
  lockEntry,
  unlockEntrySecrets,
  verifyLockPin,
} from "./entryLock";
import {
  CLIPBOARD_CLEAR_MS,
  HIDDEN_TAB_LOCK_MS,
  isValidImportBlob,
  LIMITS,
  MAX_IMPORT_FILE_BYTES,
  truncateField,
  validateLockPin,
  validatePassword,
} from "./security";
import { sealVault, unlockVault, type StoredBlob } from "./storage";

type VaultEntryType = VaultEntry["type"];

function newId(): string {
  return crypto.randomUUID();
}

function entriesEqual(a: VaultEntry | null, b: VaultEntry | null): boolean {
  if (!a || !b || a.id !== b.id) return false;
  return (
    a.title === b.title &&
    (a.folderId ?? null) === (b.folderId ?? null) &&
    (a.content ?? "") === (b.content ?? "") &&
    (a.url ?? "") === (b.url ?? "") &&
    (a.username ?? "") === (b.username ?? "") &&
    (a.password ?? "") === (b.password ?? "") &&
    Boolean(a.locked) === Boolean(b.locked)
  );
}

function isEntryUngrouped(entry: VaultEntry): boolean {
  return !entry.folderId;
}

function cloneEntry(e: VaultEntry): VaultEntry {
  return JSON.parse(JSON.stringify(e)) as VaultEntry;
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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderTarget, setRenameFolderTarget] = useState<VaultFolder | null>(null);
  const [renameFolderText, setRenameFolderText] = useState("");
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<VaultFolder | null>(null);
  const [folderSelectMode, setFolderSelectMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [dropHoverFolderId, setDropHoverFolderId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwModalError, setPwModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addFabOpen, setAddFabOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importConfirm, setImportConfirm] = useState<{
    imported: VaultData;
    blob: StoredBlob;
  } | null>(null);

  type SyncStatus = "idle" | "saving" | "saved" | "error";
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const savedHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Draft for “create new” modal — not persisted until user clicks บันทึก. */
  const [createModal, setCreateModal] = useState<{
    type: VaultEntry["type"];
    title: string;
    content: string;
    url: string;
    username: string;
    password: string;
    folderId: string;
  } | null>(null);

  /** Edit modal: baseline vs draft for dirty detection. */
  const [editBaseline, setEditBaseline] = useState<VaultEntry | null>(null);
  const [editDraft, setEditDraft] = useState<VaultEntry | null>(null);
  const [editDiscardOpen, setEditDiscardOpen] = useState(false);

  const [unlockedEntryIds, setUnlockedEntryIds] = useState<Set<string>>(() => new Set());
  const lockPinSessionKeyRef = useRef<CryptoKey | null>(null);
  const [pinDialog, setPinDialog] = useState<{
    mode: "setup" | "unlock" | "change";
    entryId?: string;
    afterAction?: "open" | "lock";
  } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinOld, setPinOld] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const createTitleRef = useRef<HTMLInputElement>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);
  const createModalWasOpenRef = useRef(false);
  const editModalWasOpenRef = useRef(false);

  useEffect(() => {
    setData(initialData);
    setEditDraft(null);
    setEditBaseline(null);
    setUnlockedEntryIds(new Set());
    lockPinSessionKeyRef.current = null;
  }, [initialData]);

  useEffect(() => {
    if (currentFolderId && !data.folders.some((f) => f.id === currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [data.folders, currentFolderId]);

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

  const markEntryUnlocked = useCallback((entryId: string) => {
    setUnlockedEntryIds((prev) => new Set(prev).add(entryId));
  }, []);

  const resolveEntryForEdit = useCallback(
    async (entry: VaultEntry): Promise<VaultEntry> => {
      if (!isEntryLocked(entry)) return cloneEntry(entry);
      const key = lockPinSessionKeyRef.current;
      if (!key) throw new Error("no lock key");
      const secrets = await unlockEntrySecrets(entry, key);
      const plain = applySecretsToEntry(
        { ...entry, locked: undefined, lockedPayload: undefined },
        secrets,
      );
      return cloneEntry(plain);
    },
    [],
  );

  const openEditModalWithEntry = useCallback((entry: VaultEntry) => {
    void resolveEntryForEdit(entry).then((resolved) => {
      setEditBaseline(cloneEntry(resolved));
      setEditDraft(cloneEntry(resolved));
    });
  }, [resolveEntryForEdit]);

  const openEditModal = useCallback(
    (entry: VaultEntry) => {
      if (isEntryLocked(entry) && !unlockedEntryIds.has(entry.id)) {
        setPinDialog({ mode: "unlock", entryId: entry.id, afterAction: "open" });
        setPinInput("");
        setPinConfirm("");
        setPinError(null);
        return;
      }
      openEditModalWithEntry(entry);
    },
    [unlockedEntryIds, openEditModalWithEntry],
  );

  const persistLockedEntry = useCallback(
    async (draft: VaultEntry) => {
      const key = lockPinSessionKeyRef.current;
      if (!key) {
        showToast("ใส่ PIN ก่อนล็อกรายการ");
        return;
      }
      const locked = await lockEntry(draft, key);
      let nextForPersist: VaultData | null = null;
      setData((prev) => {
        nextForPersist = {
          ...prev,
          entries: prev.entries.map((en) => (en.id === locked.id ? locked : en)),
        };
        return nextForPersist;
      });
      setUnlockedEntryIds((prev) => {
        const nextIds = new Set(prev);
        nextIds.delete(locked.id);
        return nextIds;
      });
      setEditDraft(null);
      setEditBaseline(null);
      if (nextForPersist) {
        await persistWithFeedback(nextForPersist);
      }
      showToast("ล็อกรายการแล้ว");
    },
    [persistWithFeedback, showToast],
  );

  const requestLockCurrentEntry = useCallback(() => {
    if (!editDraft) return;
    if (!data.lockPin) {
      setPinDialog({ mode: "setup", entryId: editDraft.id, afterAction: "lock" });
      setPinInput("");
      setPinConfirm("");
      setPinError(null);
      return;
    }
    if (!lockPinSessionKeyRef.current) {
      setPinDialog({ mode: "unlock", entryId: editDraft.id, afterAction: "lock" });
      setPinInput("");
      setPinConfirm("");
      setPinError(null);
      return;
    }
    void persistLockedEntry(editDraft);
  }, [data.lockPin, editDraft, persistLockedEntry]);

  const unlockEntryInVault = useCallback(async () => {
    if (!editDraft) return;
    const vaultEntry = data.entries.find((e) => e.id === editDraft.id);
    if (!vaultEntry || !isEntryLocked(vaultEntry)) return;
    const key = lockPinSessionKeyRef.current;
    if (!key) {
      setPinDialog({ mode: "unlock", entryId: editDraft.id, afterAction: "open" });
      setPinInput("");
      setPinConfirm("");
      setPinError(null);
      return;
    }
    const secrets = await unlockEntrySecrets(vaultEntry, key);
    const merged = applySecretsToEntry(
      { ...vaultEntry, locked: undefined, lockedPayload: undefined },
      secrets,
    );
    merged.folderId = editDraft.folderId ?? null;
    const next: VaultData = {
      ...data,
      entries: data.entries.map((en) => (en.id === merged.id ? merged : en)),
    };
    setData(next);
    setEditBaseline(cloneEntry(merged));
    setEditDraft(cloneEntry(merged));
    setUnlockedEntryIds((prev) => {
      const ids = new Set(prev);
      ids.delete(merged.id);
      return ids;
    });
    await persistWithFeedback(next);
    showToast("ปลดล็อกรายการแล้ว");
  }, [data, editDraft, persistWithFeedback, showToast]);

  const submitPinDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinBusy(true);
    try {
      if (pinDialog?.mode === "setup") {
        const err = validateLockPin(pinInput);
        if (err) {
          setPinError(err);
          return;
        }
        if (pinInput !== pinConfirm) {
          setPinError("PIN ไม่ตรงกัน");
          return;
        }
        const lockPin = await createLockPinConfig(pinInput);
        const key = await deriveLockKey(pinInput, lockPin.saltB64);
        lockPinSessionKeyRef.current = key;
        const afterAction = pinDialog.afterAction;
        let next: VaultData = { ...data, lockPin };
        if (afterAction === "lock" && editDraft) {
          const locked = await lockEntry(editDraft, key);
          next = {
            ...next,
            entries: data.entries.map((en) => (en.id === locked.id ? locked : en)),
          };
          setUnlockedEntryIds((prev) => {
            const ids = new Set(prev);
            ids.delete(locked.id);
            return ids;
          });
          setEditDraft(null);
          setEditBaseline(null);
        }
        setData(next);
        await persistWithFeedback(next);
        setPinDialog(null);
        setPinInput("");
        setPinConfirm("");
        showToast(afterAction === "lock" ? "ล็อกรายการแล้ว" : "ตั้ง PIN แล้ว");
        return;
      }

      if (pinDialog?.mode === "unlock") {
        const err = validateLockPin(pinInput);
        if (err) {
          setPinError(err);
          return;
        }
        if (!data.lockPin) {
          setPinError("ยังไม่ได้ตั้ง PIN");
          return;
        }
        const ok = await verifyLockPin(pinInput, data.lockPin);
        if (!ok) {
          setPinError("PIN ไม่ถูกต้อง");
          return;
        }
        const key = await deriveLockKey(pinInput, data.lockPin.saltB64);
        lockPinSessionKeyRef.current = key;
        const entryId = pinDialog.entryId;
        if (entryId) markEntryUnlocked(entryId);
        const after = pinDialog.afterAction;
        setPinDialog(null);
        setPinInput("");
        setPinConfirm("");
        if (after === "lock" && editDraft) {
          await persistLockedEntry(editDraft);
        } else if (entryId) {
          const entry = data.entries.find((en) => en.id === entryId);
          if (entry) openEditModalWithEntry(entry);
        }
        return;
      }

      if (pinDialog?.mode === "change") {
        const oldErr = validateLockPin(pinOld);
        if (oldErr) {
          setPinError(`PIN เดิม: ${oldErr}`);
          return;
        }
        const newErr = validateLockPin(pinInput);
        if (newErr) {
          setPinError(newErr);
          return;
        }
        if (pinInput !== pinConfirm) {
          setPinError("PIN ใหม่ไม่ตรงกัน");
          return;
        }
        if (!data.lockPin) {
          setPinError("ยังไม่ได้ตั้ง PIN");
          return;
        }
        const ok = await verifyLockPin(pinOld, data.lockPin);
        if (!ok) {
          setPinError("PIN เดิมไม่ถูกต้อง");
          return;
        }
        const oldKey = await deriveLockKey(pinOld, data.lockPin.saltB64);
        const newLockPin = await createLockPinConfig(pinInput);
        const newKey = await deriveLockKey(pinInput, newLockPin.saltB64);
        const relocked: VaultEntry[] = [];
        for (const en of data.entries) {
          if (!isEntryLocked(en)) {
            relocked.push(en);
            continue;
          }
          const secrets = await unlockEntrySecrets(en, oldKey);
          const plain = applySecretsToEntry(
            { ...en, locked: undefined, lockedPayload: undefined },
            secrets,
          );
          relocked.push(await lockEntry(plain, newKey));
        }
        lockPinSessionKeyRef.current = newKey;
        const next: VaultData = { ...data, lockPin: newLockPin, entries: relocked };
        setData(next);
        await persistWithFeedback(next);
        setPinDialog(null);
        setPinInput("");
        setPinConfirm("");
        setPinOld("");
        showToast("เปลี่ยน PIN แล้ว");
      }
    } catch {
      setPinError("ดำเนินการไม่สำเร็จ");
    } finally {
      setPinBusy(false);
    }
  };

  const assignEntryToFolder = useCallback(
    (entryId: string, targetFolderId: string) => {
      const folderExists = data.folders.some((f) => f.id === targetFolderId);
      if (!folderExists) return;
      const en = data.entries.find((x) => x.id === entryId);
      if (!en) return;
      if (en.folderId === targetFolderId) {
        showToast("รายการอยู่ในหมวดนี้อยู่แล้ว");
        return;
      }
      const label =
        folderPathLabel(data.folders, targetFolderId) ||
        data.folders.find((f) => f.id === targetFolderId)?.name ||
        "";
      const next: VaultData = {
        ...data,
        entries: data.entries.map((item) =>
          item.id === entryId
            ? { ...item, folderId: targetFolderId, updatedAt: Date.now() }
            : item,
        ),
      };
      setData(next);
      void persistWithFeedback(next);
      showToast(`ย้ายไปหมวด "${label}" แล้ว`);
    },
    [data, persistWithFeedback, showToast],
  );

  const handleFolderDropTargetDragOver = useCallback(
    (folderId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropHoverFolderId(folderId);
    },
    [],
  );

  const handleFolderDropLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (e.currentTarget.contains(related)) return;
    setDropHoverFolderId(null);
  }, []);

  const handleFolderDrop = useCallback(
    (folderId: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropHoverFolderId(null);
      const entryId = e.dataTransfer.getData(DND_ENTRY_MIME);
      if (!entryId) return;
      assignEntryToFolder(entryId, folderId);
    },
    [assignEntryToFolder],
  );

  useEffect(() => {
    const clearHighlight = () => setDropHoverFolderId(null);
    window.addEventListener("dragend", clearHighlight);
    return () => window.removeEventListener("dragend", clearHighlight);
  }, []);

  const clearLockSession = useCallback(() => {
    setUnlockedEntryIds(new Set());
    lockPinSessionKeyRef.current = null;
    setPinDialog(null);
    setPinInput("");
    setPinConfirm("");
    setPinOld("");
    setPinError(null);
  }, []);

  const handleLock = useCallback(() => {
    clearLockSession();
    clearSavedHideTimer();
    setSyncStatus("idle");
    onLock();
  }, [clearLockSession, onLock]);

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

  /** Auto-lock when the tab stays hidden (e.g. user switched apps). */
  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenTimer = setTimeout(() => {
          showToast("ล็อกอัตโนมัติขณะแท็บถูกซ่อน");
          handleLockRef.current();
        }, HIDDEN_TAB_LOCK_MS);
      } else if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (hiddenTimer) clearTimeout(hiddenTimer);
    };
  }, [showToast]);

  useEffect(() => {
    return () => {
      if (clipboardClearTimerRef.current) clearTimeout(clipboardClearTimerRef.current);
    };
  }, []);

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

  const defaultFolderIdForCreate = useCallback((): string => {
    return currentFolderId ?? "";
  }, [currentFolderId]);

  const openCreateModal = (type: VaultEntry["type"]) => {
    setCreateModal({
      type,
      title: type === "note" ? "" : "",
      content: "",
      url: "",
      username: "",
      password: "",
      folderId: defaultFolderIdForCreate(),
    });
  };

  const submitCreateModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createModal) return;
    if (data.entries.length >= LIMITS.maxEntries) {
      showToast(`ไม่สามารถเพิ่มได้เกิน ${LIMITS.maxEntries} รายการ`);
      return;
    }
    const id = newId();
    const titleTrim = createModal.title.trim();
    const folderPick = createModal.folderId.trim();
    const folderId = folderPick ? folderPick : null;
    const base: VaultEntry =
      createModal.type === "note"
        ? {
            id,
            type: "note",
            title: titleTrim || "",
            updatedAt: Date.now(),
            content: createModal.content,
            folderId,
          }
        : {
            id,
            type: "login",
            title: titleTrim || "",
            updatedAt: Date.now(),
            url: createModal.url,
            username: createModal.username,
            password: createModal.password,
            folderId,
          };
    const next = { ...data, entries: [base, ...data.entries] };
    setData(next);
    setCreateModal(null);
    void persistWithFeedback(next);
    showToast("บันทึกแล้ว");
  };

  const submitNewFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = truncateField(newFolderName.trim(), LIMITS.folderName);
    if (!name) return;
    if (data.folders.length >= LIMITS.maxFolders) {
      showToast(`ไม่สามารถเพิ่มได้เกิน ${LIMITS.maxFolders} หมวด`);
      return;
    }
    if (!isValidParentId(data.folders, currentFolderId)) {
      showToast(`ไม่สามารถสร้างหมวดลึกเกิน ${LIMITS.maxFolderDepth} ระดับ`);
      return;
    }
    const folder: VaultFolder = {
      id: newId(),
      name,
      updatedAt: Date.now(),
      parentId: currentFolderId,
    };
    const next = { ...data, folders: [...data.folders, folder] };
    setData(next);
    setNewFolderName("");
    setCreateFolderOpen(false);
    void persistWithFeedback(next);
    showToast(currentFolderId ? "สร้างหมวดย่อยแล้ว" : "สร้างหมวดแล้ว");
  };

  const openRenameFolder = (folder: VaultFolder) => {
    setRenameFolderTarget(folder);
    setRenameFolderText(folder.name);
  };

  const saveRenameFolder = () => {
    if (!renameFolderTarget) return;
    const name = renameFolderText.trim();
    if (!name) return;
    const next = {
      ...data,
      folders: data.folders.map((f) =>
        f.id === renameFolderTarget.id ? { ...f, name, updatedAt: Date.now() } : f,
      ),
    };
    setData(next);
    setRenameFolderTarget(null);
    setRenameFolderText("");
    void persistWithFeedback(next);
    showToast("เปลี่ยนชื่อหมวดแล้ว");
  };

  const requestDeleteFolder = (folder: VaultFolder) => {
    if (hasChildFolders(data.folders, folder.id)) {
      showToast("ลบหมวดย่อยก่อน");
      return;
    }
    setDeleteFolderTarget(folder);
  };

  const completeFolderDelete = () => {
    if (!deleteFolderTarget) return;
    const id = deleteFolderTarget.id;
    if (hasChildFolders(data.folders, id)) {
      showToast("ลบหมวดย่อยก่อน");
      setDeleteFolderTarget(null);
      return;
    }
    const next: VaultData = {
      ...data,
      folders: data.folders.filter((f) => f.id !== id),
      entries: data.entries.map((en) =>
        en.folderId === id ? { ...en, folderId: null } : en,
      ),
    };
    setData(next);
    setDeleteFolderTarget(null);
    if (currentFolderId === id) setCurrentFolderId(null);
    void persistWithFeedback(next);
    showToast("ลบหมวดแล้ว — รายการย้ายไปไม่มีหมวด");
  };

  const toggleFolderSelect = (folderId: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const exitFolderSelectMode = () => {
    setFolderSelectMode(false);
    setSelectedFolderIds(new Set());
  };

  const bulkDeleteFolders = () => {
    const ids = [...selectedFolderIds];
    const blocked = ids.filter((id) => hasChildFolders(data.folders, id));
    const deletable = ids.filter((id) => !hasChildFolders(data.folders, id));
    if (deletable.length === 0) {
      showToast("ลบหมวดย่อยก่อน");
      return;
    }
    const deleteSet = new Set(deletable);
    const next: VaultData = {
      ...data,
      folders: data.folders.filter((f) => !deleteSet.has(f.id)),
      entries: data.entries.map((en) =>
        en.folderId && deleteSet.has(en.folderId) ? { ...en, folderId: null } : en,
      ),
    };
    setData(next);
    exitFolderSelectMode();
    setBulkDeleteOpen(false);
    if (currentFolderId && deleteSet.has(currentFolderId)) setCurrentFolderId(null);
    void persistWithFeedback(next);
    if (blocked.length > 0) {
      showToast(`ลบ ${deletable.length} หมวด — ข้าม ${blocked.length} หมวดที่มีหมวดย่อย`);
    } else {
      showToast(`ลบ ${deletable.length} หมวดแล้ว`);
    }
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

  const submitEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;
    const titleTrim = editDraft.title.trim();
    const merged: VaultEntry = {
      ...editDraft,
      title: titleTrim || "",
      updatedAt: Date.now(),
      locked: undefined,
      lockedPayload: undefined,
    };
    const vaultEntry = data.entries.find((en) => en.id === merged.id);
    let saved: VaultEntry = merged;
    if (vaultEntry && isEntryLocked(vaultEntry)) {
      const key = lockPinSessionKeyRef.current;
      if (!key) {
        showToast("ใส่ PIN ก่อนบันทึกรายการล็อก");
        return;
      }
      saved = await lockEntry(merged, key);
      markEntryUnlocked(merged.id);
    }
    let nextForPersist: VaultData | null = null;
    setData((prev) => {
      nextForPersist = {
        ...prev,
        entries: prev.entries.map((en) => (en.id === saved.id ? saved : en)),
      };
      return nextForPersist;
    });
    setEditDraft(null);
    setEditBaseline(null);
    if (nextForPersist) {
      await persistWithFeedback(nextForPersist);
    }
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
    setUnlockedEntryIds((prev) => {
      const ids = new Set(prev);
      ids.delete(id);
      return ids;
    });
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
      showToast("ส่งออกสำรองแล้ว");
    } catch {
      showToast("ส่งออกไม่สำเร็จ");
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
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      showToast("ไฟล์ใหญ่เกินไป (สูงสุด 5 MB)");
      return;
    }
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!isValidImportBlob(parsed)) throw new Error("bad");
      const imported = await unlockVault(vaultPassword, parsed);
      setImportConfirm({ imported, blob: parsed });
    } catch {
      showToast("นำเข้าไม่สำเร็จ — รหัสผ่านไม่ถูกต้องหรือไฟล์ไม่ถูกต้อง");
    }
  };

  const applyImport = async () => {
    if (!importConfirm) return;
    await onImportReplace(importConfirm.imported, importConfirm.blob);
    setData(importConfirm.imported);
    setEditDraft(null);
    setEditBaseline(null);
    clearLockSession();
    setImportConfirm(null);
    clearSavedHideTimer();
    setSyncStatus("idle");
    showToast("กู้คืนสำรองแล้ว");
  };

  const copyText = async (label: string, value: string, opts?: { sensitive?: boolean }) => {
    try {
      await navigator.clipboard.writeText(value);
      if (opts?.sensitive) {
        if (clipboardClearTimerRef.current) clearTimeout(clipboardClearTimerRef.current);
        clipboardClearTimerRef.current = setTimeout(() => {
          void navigator.clipboard.writeText("").catch(() => {});
          clipboardClearTimerRef.current = null;
        }, CLIPBOARD_CLEAR_MS);
        showToast(`${label} คัดลอกแล้ว — จะล้างคลิปบอร์ดใน 30 วินาที`);
      } else {
        showToast(`${label} คัดลอกแล้ว`);
      }
    } catch {
      showToast("ไม่สามารถใช้คลิปบอร์ดได้");
    }
  };

  const qLower = query.trim().toLowerCase();

  const isSearching = qLower.length > 0;

  const breadcrumbAncestors = useMemo(
    () => (currentFolderId ? ancestorsOf(data.folders, currentFolderId) : []),
    [data.folders, currentFolderId],
  );

  const visibleFolders = useMemo(() => {
    if (isSearching) return [];
    return childrenOf(data.folders, currentFolderId);
  }, [data.folders, currentFolderId, isSearching]);

  const visibleEntries = useMemo(() => {
    let list = [...data.entries].sort((a, b) => b.updatedAt - a.updatedAt);
    if (filterType !== "all") {
      list = list.filter((e) => e.type === filterType);
    }
    if (isSearching) {
      return list.filter((e) => {
        const path = folderPathLabel(data.folders, e.folderId);
        if (isEntryLocked(e)) {
          const hay = [
            path,
            "ล็อก",
            "รายการที่ล็อกไว้",
            e.type === "login" ? "รหัสเว็บ" : "โน้ต",
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(qLower);
        }
        const hay = [
          e.title,
          e.content,
          e.url,
          e.username,
          path,
          e.type === "login" ? "รหัสเว็บ" : "โน้ต",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(qLower);
      });
    }
    const targetFolder = currentFolderId;
    return list.filter((e) => (e.folderId ?? null) === targetFolder);
  }, [data.entries, data.folders, qLower, filterType, currentFolderId, isSearching]);

  const folderSelectOpts = useMemo(
    () => folderSelectOptions(data.folders),
    [data.folders],
  );

  const isViewEmpty =
    visibleFolders.length === 0 && visibleEntries.length === 0;

  const submitChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwModalError(null);
    const pwError = validatePassword(newPw);
    if (pwError) {
      setPwModalError(pwError);
      return;
    }
    if (newPw !== newPw2) {
      setPwModalError("รหัสผ่านใหม่ไม่ตรงกัน");
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
      showToast("เปลี่ยนรหัสผ่านแล้ว");
    } catch {
      setPwModalError("รหัสผ่านปัจจุบันไม่ถูกต้องหรืออัปเดตไม่สำเร็จ");
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

  const navigateToFolder = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    exitFolderSelectMode();
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <VaultHeader
        syncStatus={syncStatus}
        syncLabel={syncLabel}
        onRetryPersist={() => void retryPersist()}
        onChangePassword={() => setShowChangePw(true)}
        onExport={() => void exportBackup()}
        onImport={onPickImport}
        onLock={handleLock}
        onCreateNote={() => openCreateModal("note")}
        onCreateLogin={() => openCreateModal("login")}
        onOpenMore={() => setMoreOpen(true)}
        topBarExtra={topBarExtra}
        importInputRef={importInputRef}
        onImportFile={onImportFile}
      />

      <div className="flex min-h-0 flex-1">
        <FolderSidebar
          folders={data.folders}
          currentFolderId={currentFolderId}
          dropHoverFolderId={dropHoverFolderId}
          onNavigate={navigateToFolder}
          onFolderDragOver={handleFolderDropTargetDragOver}
          onFolderDragLeave={handleFolderDropLeave}
          onFolderDrop={handleFolderDrop}
        />

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-6 md:pb-6 md:pt-6">
          <div className="mx-auto max-w-4xl space-y-5">
            {!isSearching ? (
              <FolderBreadcrumb
                ancestors={breadcrumbAncestors}
                atRoot={currentFolderId === null}
                selectMode={folderSelectMode}
                selectedCount={selectedFolderIds.size}
                onNavigate={navigateToFolder}
                onCreateFolder={() => setCreateFolderOpen(true)}
                onToggleSelectMode={() => {
                  if (folderSelectMode) exitFolderSelectMode();
                  else setFolderSelectMode(true);
                }}
                onDeleteSelected={() => setBulkDeleteOpen(true)}
              />
            ) : null}
            <VaultToolbar
              query={query}
              maxQueryLength={LIMITS.searchQuery}
              filterType={filterType}
              onQueryChange={(value) =>
                setQuery(truncateField(value, LIMITS.searchQuery))
              }
              onFilterChange={setFilterType}
            />

            {isViewEmpty ? (
              <EmptyState
                variant={
                  isSearching
                    ? "no-results"
                    : data.entries.length === 0 && data.folders.length === 0
                      ? "empty-vault"
                      : "empty-folder"
                }
                onCreateNote={() => openCreateModal("note")}
                onCreateLogin={() => openCreateModal("login")}
                onCreateFolder={() => setCreateFolderOpen(true)}
              />
            ) : (
              <div className="space-y-6">
                {visibleFolders.length > 0 ? (
                  <section className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">หมวดหมู่</h2>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleFolders.map((f) => (
                        <FolderCard
                          key={f.id}
                          folder={f}
                          entryCount={countEntriesInFolder(data.entries, f.id)}
                          childFolderCount={childrenOf(data.folders, f.id).length}
                          selectMode={folderSelectMode}
                          selected={selectedFolderIds.has(f.id)}
                          dropHover={dropHoverFolderId === f.id}
                          onOpen={(f) => navigateToFolder(f.id)}
                          onToggleSelect={toggleFolderSelect}
                          onRename={openRenameFolder}
                          onDelete={requestDeleteFolder}
                          onDropEntry={(folderId, entryId) =>
                            assignEntryToFolder(entryId, folderId)
                          }
                          onDragOver={handleFolderDropTargetDragOver}
                          onDragLeave={handleFolderDropLeave}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                {visibleEntries.length > 0 ? (
                  <section className="space-y-3">
                    {visibleFolders.length > 0 ? (
                      <h2 className="text-sm font-medium text-muted-foreground">รายการ</h2>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleEntries.map((e) => (
                        <EntryCard
                          key={e.id}
                          entry={e}
                          query={query}
                          ungrouped={isEntryUngrouped(e)}
                          isLockedDisplay={
                            isEntryLocked(e) && !unlockedEntryIds.has(e.id)
                          }
                          folderPath={
                            isSearching ? folderPathLabel(data.folders, e.folderId) : undefined
                          }
                          onOpen={openEditModal}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </main>
      </div>

      {toast ? <VaultToast message={toast} /> : null}

      <AddEntryFab
        open={addFabOpen}
        onOpenChange={setAddFabOpen}
        onCreateNote={() => openCreateModal("note")}
        onCreateLogin={() => openCreateModal("login")}
      />

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
            {data.lockPin ? (
              <Button
                type="button"
                variant="ghost"
                className="h-12 justify-start text-base"
                onClick={() => {
                  setPinDialog({ mode: "change" });
                  setPinOld("");
                  setPinInput("");
                  setPinConfirm("");
                  setPinError(null);
                  setMoreOpen(false);
                }}
              >
                เปลี่ยน PIN ล็อกรายการ
              </Button>
            ) : null}
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
                        placeholder="โน้ตไม่มีชื่อ"
                        maxLength={LIMITS.title}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-folder-select">หมวดหมู่</Label>
                      <select
                        id="create-folder-select"
                        data-cy="create-folder-select"
                        className={selectLikeClass}
                        value={createModal.folderId}
                        onChange={(ev) =>
                          setCreateModal((d) =>
                            d ? { ...d, folderId: ev.target.value } : d,
                          )
                        }
                      >
                        <option value="">ไม่มีหมวด</option>
                        {folderSelectOpts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {`${"  ".repeat(o.depth)}${o.label}`}
                          </option>
                        ))}
                      </select>
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
                          maxLength={LIMITS.content}
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
                            maxLength={LIMITS.url}
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
                            maxLength={LIMITS.username}
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
                        placeholder="รหัสเว็บไม่มีชื่อ"
                        maxLength={LIMITS.title}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-folder-select">หมวดหมู่</Label>
                      <select
                        id="edit-folder-select"
                        data-cy="edit-folder-select"
                        className={selectLikeClass}
                        value={editDraft.folderId ?? ""}
                        onChange={(ev) =>
                          setEditDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  folderId: ev.target.value
                                    ? ev.target.value
                                    : null,
                                }
                              : d,
                          )
                        }
                      >
                        <option value="">ไม่มีหมวด</option>
                        {folderSelectOpts.map((o) => (
                          <option key={o.id} value={o.id}>
                            {`${"  ".repeat(o.depth)}${o.label}`}
                          </option>
                        ))}
                      </select>
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
                          maxLength={LIMITS.content}
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
                              maxLength={LIMITS.url}
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
                              maxLength={LIMITS.username}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-11 shrink-0 sm:w-24"
                              onClick={() =>
                                void copyText(
                                  "ชื่อผู้ใช้",
                                  editDraft.username ?? "",
                                  { sensitive: true },
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
                                  "รหัสผ่าน",
                                  editDraft.password ?? "",
                                  { sensitive: true },
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
                  <div className="flex w-full flex-col gap-2 sm:mr-auto sm:w-auto sm:flex-row">
                    <Button
                      type="button"
                      variant="destructive"
                      className="w-full sm:w-auto"
                      onClick={() => setDeleteOpen(true)}
                    >
                      ลบรายการนี้
                    </Button>
                    {editDraft &&
                    isEntryLocked(
                      data.entries.find((en) => en.id === editDraft.id) ?? editDraft,
                    ) ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => void unlockEntryInVault()}
                      >
                        ปลดล็อกรายการ
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => requestLockCurrentEntry()}
                      >
                        ล็อกรายการ
                      </Button>
                    )}
                  </div>
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

      <Dialog
        open={createFolderOpen}
        onOpenChange={(o) => {
          setCreateFolderOpen(o);
          if (!o) setNewFolderName("");
        }}
      >
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {currentFolderId ? "สร้างหมวดย่อย" : "สร้างหมวด"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              ตั้งชื่อหมวดใหม่ในตำแหน่งปัจจุบัน
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNewFolder} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-folder-name">ชื่อหมวด</Label>
              <Input
                id="new-folder-name"
                value={newFolderName}
                onChange={(ev) => setNewFolderName(ev.target.value)}
                placeholder="เช่น งาน · ส่วนตัว · โปรเจกต์"
                className="min-h-11"
                maxLength={LIMITS.folderName}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateFolderOpen(false)}>
                ยกเลิก
              </Button>
              <Button
                id="vault-folder-create-submit-button"
                data-cy="vault-folder-create-submit-button"
                type="submit"
              >
                สร้าง
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameFolderTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRenameFolderTarget(null);
            setRenameFolderText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>เปลี่ยนชื่อหมวด</DialogTitle>
            <DialogDescription className="sr-only">แก้ไขชื่อหมวด</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveRenameFolder();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="rename-folder-input">ชื่อหมวด</Label>
              <Input
                id="rename-folder-input"
                value={renameFolderText}
                onChange={(ev) => setRenameFolderText(ev.target.value)}
                className="min-h-11"
                maxLength={LIMITS.folderName}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRenameFolderTarget(null);
                  setRenameFolderText("");
                }}
              >
                ยกเลิก
              </Button>
              <Button type="submit">บันทึก</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ลบ {selectedFolderIds.size} หมวดที่เลือก?
            </AlertDialogTitle>
            <AlertDialogDescription>
              หมวดที่มีหมวดย่อยจะถูกข้าม รายการในหมวดที่ลบจะย้ายไปไม่มีหมวด
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={bulkDeleteFolders}
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteFolderTarget}
        onOpenChange={(o) => !o && setDeleteFolderTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ลบหมวด &quot;{deleteFolderTarget?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              รายการในหมวดนี้จะถูกย้ายไป &quot;ไม่มีหมวด&quot; ข้อมูลโน้ตและรหัสไม่ถูกลบ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel id="vault-folder-delete-cancel-button" data-cy="vault-folder-delete-cancel-button">
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              id="vault-folder-delete-confirm-button"
              data-cy="vault-folder-delete-confirm-button"
              onClick={completeFolderDelete}
            >
              ลบหมวด
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        open={pinDialog !== null}
        onOpenChange={(open) => {
          if (!open && !pinBusy) {
            setPinDialog(null);
            setPinInput("");
            setPinConfirm("");
            setPinOld("");
            setPinError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {pinDialog?.mode === "setup"
                ? "ตั้ง PIN ล็อกรายการ"
                : pinDialog?.mode === "change"
                  ? "เปลี่ยน PIN ล็อกรายการ"
                  : "ใส่ PIN"}
            </DialogTitle>
            <DialogDescription>
              {pinDialog?.mode === "setup"
                ? "PIN 4–6 หลักสำหรับล็อกรายการแยกจากรหัสตู้เซฟ หากลืม PIN จะกู้เนื้อหารายการล็อกไม่ได้"
                : pinDialog?.mode === "change"
                  ? "ใส่ PIN เดิมและ PIN ใหม่ — รายการล็อกทั้งหมดจะถูกเข้ารหัสใหม่"
                  : "ใส่ PIN เพื่อดูรายการที่ล็อกไว้"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void submitPinDialog(e)} className="space-y-4">
            {pinDialog?.mode === "change" ? (
              <div className="space-y-2">
                <Label htmlFor="pin-old">PIN เดิม</Label>
                <Input
                  id="pin-old"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]*"
                  value={pinOld}
                  onChange={(ev) => setPinOld(ev.target.value)}
                  className="min-h-11 text-center text-lg tracking-[0.3em]"
                  placeholder="••••"
                  autoFocus
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="pin-input">
                {pinDialog?.mode === "change" ? "PIN ใหม่" : "PIN"}
              </Label>
              <Input
                id="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                value={pinInput}
                onChange={(ev) => setPinInput(ev.target.value)}
                className="min-h-11 text-center text-lg tracking-[0.3em]"
                placeholder="••••"
                autoFocus={pinDialog?.mode !== "change"}
              />
            </div>
            {pinDialog?.mode === "setup" || pinDialog?.mode === "change" ? (
              <div className="space-y-2">
                <Label htmlFor="pin-confirm">ยืนยัน PIN</Label>
                <Input
                  id="pin-confirm"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]*"
                  value={pinConfirm}
                  onChange={(ev) => setPinConfirm(ev.target.value)}
                  className="min-h-11 text-center text-lg tracking-[0.3em]"
                  placeholder="••••"
                />
              </div>
            ) : null}
            {pinError ? <p className="text-sm text-destructive">{pinError}</p> : null}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pinBusy}
                onClick={() => {
                  setPinDialog(null);
                  setPinInput("");
                  setPinConfirm("");
                  setPinOld("");
                  setPinError(null);
                }}
              >
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pinBusy}>
                {pinDialog?.mode === "setup"
                  ? "ตั้ง PIN"
                  : pinDialog?.mode === "change"
                    ? "เปลี่ยน PIN"
                    : "ยืนยัน"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showChangePw}
        onOpenChange={(o) => !busy && setShowChangePw(o)}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
          onPointerDownOutside={(e) => busy && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>เปลี่ยนรหัสผ่าน</DialogTitle>
            <DialogDescription>
              จะเข้ารหัสตู้เซฟใหม่ ในโหมดคลาวด์รหัสเข้าสู่ระบบจะถูกอัปเดตด้วย
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitChangePw} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opw">รหัสผ่านปัจจุบัน</Label>
              <PasswordInput
                id="opw"
                value={oldPw}
                onChange={setOldPw}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw">รหัสผ่านใหม่</Label>
              <PasswordInput
                id="npw"
                value={newPw}
                onChange={setNewPw}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="npw2">ยืนยันรหัสผ่านใหม่</Label>
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
                ยกเลิก
              </Button>
              <Button type="submit" disabled={busy}>
                อัปเดต
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการนี้?</AlertDialogTitle>
            <AlertDialogDescription>
              การลบไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              ลบ
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
            <AlertDialogTitle>แทนที่ตู้เซฟด้วยไฟล์สำรอง?</AlertDialogTitle>
            <AlertDialogDescription>
              การเปลี่ยนแปลงที่ยังไม่ได้บันทึกบนอุปกรณ์นี้จะหายไป หากยังไม่ได้ส่งออกสำรอง
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                void applyImport();
              }}
            >
              แทนที่
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
