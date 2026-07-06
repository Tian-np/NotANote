import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  displayUsername,
  isValidUsername,
  normalizeUsername,
  usernameToAuthEmail,
} from "./authUsername";
import { fetchVaultPayload, upsertVaultPayload } from "./cloudVault";
import { getSupabase } from "./supabaseClient";
import type { VaultData } from "./types";
import { emptyVault } from "./types";
import { validatePassword } from "./security";
import { resealWithNewPassword, sealVault, unlockVault, type StoredBlob } from "./storage";
import { VaultShell } from "./VaultShell";

function authErrorHint(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") && (m.includes("email") || m.includes("mail"))) {
    return (
      "โควต้าอีเมลของ Supabase หมดแล้ว (ฟรี tier มีโควต้าน้อย) " +
      "ปิด “Confirm email” ที่ Dashboard → Authentication → Providers → Email " +
      "หรือรอให้โควต้ารีเซ็ต หรือตั้งค่า Custom SMTP (Project Settings → Authentication)"
    );
  }
  return message;
}

export function CloudApp() {
  const sb = getSupabase();
  const [init, setInit] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [vaultPassword, setVaultPassword] = useState<string | null>(null);
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const lastBlobRef = useRef<StoredBlob | null>(null);

  useEffect(() => {
    void sb.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setInit(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [sb]);

  const openVault = useCallback(
    async (userId: string, passwordPlain: string) => {
      let stored = await fetchVaultPayload(sb, userId);
      if (!stored) {
        const initial = emptyVault();
        stored = await sealVault(passwordPlain, initial);
        await upsertVaultPayload(sb, userId, stored);
      }
      const data = await unlockVault(passwordPlain, stored);
      lastBlobRef.current = stored;
      setVaultPassword(passwordPlain);
      setVaultData(data);
    },
    [sb],
  );

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!isValidUsername(username)) {
      setAuthError("ชื่อผู้ใช้: 3–32 ตัวอักษร a–z, 0–9, _ เท่านั้น");
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setAuthError(pwError);
      return;
    }
    if (password !== password2) {
      setAuthError("รหัสผ่านไม่ตรงกัน");
      return;
    }
    const normalized = normalizeUsername(username);
    const authEmail = usernameToAuthEmail(normalized);
    setBusy(true);
    try {
      const { data, error } = await sb.auth.signUp({
        email: authEmail,
        password,
        options: { data: { username: normalized } },
      });
      if (error) {
        setAuthError(authErrorHint(error.message));
        return;
      }
      if (!data.session) {
        setAuthError(
          "ไม่ได้ session หลังสมัคร หากเปิดยืนยันอีเมล ให้ยืนยันก่อน หรือขอให้แอดมินปิดการยืนยันอีเมล",
        );
        return;
      }
      const userId = data.session.user.id;
      const initial = emptyVault();
      const blob = await sealVault(password, initial);
      await upsertVaultPayload(sb, userId, blob);
      setSession(data.session);
      await openVault(userId, password);
    } catch (err) {
      setAuthError(err instanceof Error ? authErrorHint(err.message) : "สมัครสมาชิกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!isValidUsername(username)) {
      setAuthError("ชื่อผู้ใช้: 3–32 ตัวอักษร a–z, 0–9, _ เท่านั้น");
      return;
    }
    const authEmail = usernameToAuthEmail(normalizeUsername(username));
    setBusy(true);
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: authEmail, password });
      if (error) {
        setAuthError(authErrorHint(error.message));
        return;
      }
      const userId = data.session.user.id;
      await openVault(userId, password);
      setPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? authErrorHint(err.message) : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;
    setAuthError(null);
    setBusy(true);
    try {
      await openVault(session.user.id, password);
      setPassword("");
    } catch {
      setAuthError("รหัสผ่านไม่ถูกต้อง หรือตู้เซฟถูกเข้ารหัสด้วยรหัสอื่น");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    lastBlobRef.current = null;
    setVaultPassword(null);
    setVaultData(null);
    setPassword("");
    await sb.auth.signOut();
  };

  const onPersist = useCallback(
    async (data: VaultData, pw: string) => {
      if (!session?.user?.id) return;
      const blob = await sealVault(pw, data);
      lastBlobRef.current = blob;
      await upsertVaultPayload(sb, session.user.id, blob);
    },
    [sb, session?.user?.id],
  );

  const onChangePassword = useCallback(
    async (oldPw: string, newPw: string) => {
      if (!session?.user?.id) throw new Error("no session");
      const s = lastBlobRef.current;
      if (!s) throw new Error("no blob");
      await unlockVault(oldPw, s);
      const blob = await resealWithNewPassword(oldPw, newPw, s);
      await upsertVaultPayload(sb, session.user.id, blob);
      const { error } = await sb.auth.updateUser({ password: newPw });
      if (error) {
        const rollback = await resealWithNewPassword(newPw, oldPw, blob);
        await upsertVaultPayload(sb, session.user.id, rollback);
        lastBlobRef.current = rollback;
        throw error;
      }
      lastBlobRef.current = blob;
      setVaultPassword(newPw);
    },
    [sb, session?.user?.id],
  );

  const onImportReplace = useCallback(
    async (_imported: VaultData, blob: StoredBlob) => {
      if (!session?.user?.id) return;
      lastBlobRef.current = blob;
      await upsertVaultPayload(sb, session.user.id, blob);
    },
    [sb, session?.user?.id],
  );

  const onLock = () => {
    lastBlobRef.current = null;
    setVaultPassword(null);
    setVaultData(null);
  };

  if (init) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-muted-foreground">
        <p>กำลังโหลด…</p>
      </div>
    );
  }

  if (session && vaultData && vaultPassword) {
    return (
      <VaultShell
        vaultPassword={vaultPassword}
        initialData={vaultData}
        onPersist={onPersist}
        onChangePassword={onChangePassword}
        onImportReplace={onImportReplace}
        onLock={onLock}
        topBarExtra={
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <span className="max-w-[220px] truncate text-xs text-muted-foreground sm:text-sm">
              {displayUsername(session.user)}
            </span>
            <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => void handleLogout()}>
              ออกจากระบบ
            </Button>
          </div>
        }
      />
    );
  }

  if (session && (!vaultData || !vaultPassword)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/80 shadow-md">
          <CardHeader>
            <CardTitle>ปลดล็อกตู้เซฟ</CardTitle>
            <CardDescription>
              เข้าสู่ระบบเป็น {displayUsername(session.user)} กรุณาใส่รหัสผ่านบัญชี
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlockWithPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unlock-pw">รหัสผ่าน</Label>
                <PasswordInput id="unlock-pw" value={password} onChange={setPassword} autoComplete="current-password" required />
              </div>
              {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="min-h-11 flex-1" disabled={busy}>
                  ปลดล็อก
                </Button>
                <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => void handleLogout()}>
                  เปลี่ยนบัญชี
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/80 shadow-md">
        <CardHeader>
          <CardTitle>NotANote</CardTitle>
          <CardDescription>
            เข้าสู่ระบบเพื่อซิงค์ตู้เซฟที่เข้ารหัสข้ามอุปกรณ์ ใช้ชื่อผู้ใช้เท่านั้น — แอปจะแมปเป็นตัวระบุภายในของ Supabase
            (ไม่มีการส่งอีเมล)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v);
              setAuthError(null);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">เข้าสู่ระบบ</TabsTrigger>
              <TabsTrigger value="register">สมัครสมาชิก</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4 space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username-login">ชื่อผู้ใช้</Label>
                  <Input
                    id="username-login"
                    type="text"
                    autoComplete="username"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="min-h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lpw">รหัสผ่าน</Label>
                  <PasswordInput id="lpw" value={password} onChange={setPassword} autoComplete="current-password" required resetKey={tab} />
                </div>
                {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                <Button type="submit" className="w-full min-h-11" disabled={busy}>
                  เข้าสู่ระบบ
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register" className="mt-4 space-y-4">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username-register">ชื่อผู้ใช้</Label>
                  <Input
                    id="username-register"
                    type="text"
                    autoComplete="username"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="min-h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    3–32 ตัวอักษร: a–z, 0–9, _ จะถูกบันทึกเป็นตัวพิมพ์เล็ก
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rpw">รหัสผ่าน</Label>
                  <PasswordInput id="rpw" value={password} onChange={setPassword} autoComplete="new-password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rpw2">ยืนยันรหัสผ่าน</Label>
                  <PasswordInput id="rpw2" value={password2} onChange={setPassword2} autoComplete="new-password" required />
                </div>
                {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                <Button type="submit" className="w-full min-h-11" disabled={busy}>
                  สมัครสมาชิก
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="border-t border-border/60">
          <p className="text-center text-xs text-muted-foreground">
            โน้ตถูกเข้ารหัสในเบราว์เซอร์ก่อนอัปโหลด
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
