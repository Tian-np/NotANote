import { useCallback, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VaultToast } from "@/components/vault/VaultToast";
import { validatePassword } from "./security";
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
        const pwError = validatePassword(password);
        if (pwError) {
          setAuthError(pwError);
          return;
        }
        if (password !== password2) {
          setAuthError("รหัสผ่านไม่ตรงกัน");
          return;
        }
        const initial = emptyVault();
        const blob = await sealVault(password, initial);
        saveStored(blob);
        setHasLocalVault(true);
        setVaultPassword(password);
        setVaultData(initial);
        showToast("สร้างตู้เซฟแล้ว — ข้อมูลถูกเข้ารหัสในเบราว์เซอร์นี้");
      } else {
        const s = loadStored();
        if (!s) {
          setAuthError("ไม่พบตู้เซฟ กรุณาสร้างใหม่ก่อน");
          return;
        }
        const unlocked = await unlockVault(password, s);
        setVaultPassword(password);
        setVaultData(unlocked);
      }
    } catch {
      setAuthError(
        authTab === "unlock"
          ? "รหัสผ่านไม่ถูกต้องหรือข้อมูลเสียหาย"
          : "ไม่สามารถสร้างตู้เซฟได้",
      );
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
        <Card className="w-full max-w-md border-border/80 shadow-md">
          <CardHeader>
            <CardTitle>NotANote</CardTitle>
            <CardDescription>
              โหมดเครื่องเดียว: เข้ารหัสในเบราว์เซอร์นี้ หากตั้งค่า{" "}
              <code className="text-primary">VITE_SUPABASE_*</code> ใน{" "}
              <code className="text-primary">.env.local</code> จะใช้บัญชีและซิงค์หลายอุปกรณ์ได้
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
                  ปลดล็อก
                </TabsTrigger>
                <TabsTrigger value="create">สร้างใหม่</TabsTrigger>
              </TabsList>
              <TabsContent value="unlock" className="mt-4 space-y-4">
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="unlock-pw">รหัสผ่านหลัก</Label>
                    <PasswordInput id="unlock-pw" value={password} onChange={setPassword} autoComplete="off" required resetKey="unlock" />
                  </div>
                  {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                  <Button type="submit" className="w-full min-h-11" disabled={busy}>
                    ปลดล็อก
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="create" className="mt-4 space-y-4">
                {hasLocalVault ? (
                  <p className="text-sm text-muted-foreground">
                    การสร้างตู้เซฟใหม่จะแทนที่ข้อมูลในเบราว์เซอร์นี้ หากต้องการเก็บข้อมูลเดิม ให้ส่งออกสำรองก่อน
                  </p>
                ) : null}
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-pw">รหัสผ่านหลัก</Label>
                    <PasswordInput id="create-pw" value={password} onChange={setPassword} autoComplete="off" required resetKey="create" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-pw2">ยืนยันรหัสผ่าน</Label>
                    <PasswordInput id="create-pw2" value={password2} onChange={setPassword2} autoComplete="off" required resetKey="create" />
                  </div>
                  {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" className="min-h-11 flex-1" disabled={busy}>
                      สร้างตู้เซฟ
                    </Button>
                    {hasLocalVault ? (
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-h-11 flex-1"
                        onClick={() => {
                          if (window.confirm("ลบตู้เซฟจากเบราว์เซอร์นี้? ไม่สามารถย้อนกลับได้")) {
                            clearStored();
                            window.location.reload();
                          }
                        }}
                      >
                        ลบข้อมูลในเครื่อง
                      </Button>
                    ) : null}
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex-col items-stretch border-t border-border/60 pt-4">
            <p className="text-center text-xs text-muted-foreground">
              ใช้รหัสผ่านที่แข็งแรง และสำรองข้อมูลที่เข้ารหัสเป็นประจำ
            </p>
          </CardFooter>
        </Card>
        {toast ? <VaultToast message={toast} mobileOffset={false} /> : null}
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
