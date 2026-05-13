import { useCallback, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VaultShell } from "./VaultShell";
import type { VaultData } from "./types";
import { emptyVault } from "./types";
import {
  clearStored,
  loadStored,
  resealWithNewPassword,
  saveStored,
  sealVault,
  unlockVault,
  type StoredBlob,
} from "./storage";

export function LocalApp() {
  const [hasLocalVault, setHasLocalVault] = useState(() => loadStored() !== null);
  const [authTab, setAuthTab] = useState<string>(() => (loadStored() ? "unlock" : "create"));
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [vaultPassword, setVaultPassword] = useState<string | null>(null);
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    try {
      if (authTab === "create") {
        if (password.length < 8) {
          setAuthError("Use at least 8 characters for your master password.");
          return;
        }
        if (password !== password2) {
          setAuthError("Passwords do not match.");
          return;
        }
        const initial = emptyVault();
        const blob = await sealVault(password, initial);
        saveStored(blob);
        setHasLocalVault(true);
        setVaultPassword(password);
        setVaultData(initial);
        showToast("Vault created. Your data stays encrypted in this browser.");
      } else {
        const s = loadStored();
        if (!s) {
          setAuthError("No vault found. Create one first.");
          return;
        }
        const unlocked = await unlockVault(password, s);
        setVaultPassword(password);
        setVaultData(unlocked);
      }
    } catch {
      setAuthError(authTab === "unlock" ? "Wrong password or corrupted data." : "Could not create vault.");
    } finally {
      setBusy(false);
    }
  };

  const handleLock = () => {
    setVaultPassword(null);
    setVaultData(null);
    setPassword("");
    setPassword2("");
    setHasLocalVault(!!loadStored());
    setAuthTab(loadStored() ? "unlock" : "create");
  };

  const onPersist = useCallback(async (data: VaultData, pw: string) => {
    const blob = await sealVault(pw, data);
    saveStored(blob);
  }, []);

  const onChangePassword = useCallback(async (oldPw: string, newPw: string) => {
    const s = loadStored();
    if (!s) throw new Error("no vault");
    await unlockVault(oldPw, s);
    const blob = await resealWithNewPassword(oldPw, newPw, s);
    saveStored(blob);
    setVaultPassword(newPw);
  }, []);

  const onImportReplace = useCallback(async (_imported: VaultData, blob: StoredBlob) => {
    saveStored(blob);
  }, []);

  if (!vaultData || !vaultPassword) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/80 shadow-2xl">
          <CardHeader>
            <CardTitle>NotANote</CardTitle>
            <CardDescription>
              Local-only: encrypted in this browser. Add <code className="text-primary">VITE_SUPABASE_*</code> in{" "}
              <code className="text-primary">.env.local</code> for account login and multi-device sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={authTab}
              onValueChange={(v) => {
                setAuthTab(v);
                setAuthError(null);
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="unlock" disabled={!hasLocalVault}>
                  Unlock
                </TabsTrigger>
                <TabsTrigger value="create">New vault</TabsTrigger>
              </TabsList>
              <TabsContent value="unlock" className="mt-4 space-y-4">
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="unlock-pw">Master password</Label>
                    <PasswordInput id="unlock-pw" value={password} onChange={setPassword} autoComplete="off" required resetKey="unlock" />
                  </div>
                  {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                  <Button type="submit" className="w-full min-h-11" disabled={busy}>
                    Unlock
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="create" className="mt-4 space-y-4">
                {hasLocalVault ? (
                  <p className="text-sm text-muted-foreground">
                    Creating a new vault replaces data in this browser. Export an encrypted backup first if you need it.
                  </p>
                ) : null}
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-pw">Master password</Label>
                    <PasswordInput id="create-pw" value={password} onChange={setPassword} autoComplete="off" required resetKey="create" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-pw2">Confirm password</Label>
                    <PasswordInput id="create-pw2" value={password2} onChange={setPassword2} autoComplete="off" required resetKey="create" />
                  </div>
                  {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" className="min-h-11 flex-1" disabled={busy}>
                      Create vault
                    </Button>
                    {hasLocalVault ? (
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-h-11 flex-1"
                        onClick={() => {
                          if (window.confirm("Erase vault from this browser? This cannot be undone.")) {
                            clearStored();
                            window.location.reload();
                          }
                        }}
                      >
                        Erase local
                      </Button>
                    ) : null}
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex-col items-stretch border-t border-border/60 pt-4">
            <p className="text-center text-xs text-muted-foreground">Use a strong password and keep encrypted backups.</p>
          </CardFooter>
        </Card>
        {toast ? (
          <div className="fixed bottom-4 left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">
            {toast}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <VaultShell
      vaultPassword={vaultPassword}
      initialData={vaultData}
      onPersist={onPersist}
      onChangePassword={onChangePassword}
      onImportReplace={onImportReplace}
      onLock={handleLock}
    />
  );
}
