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

/** Maps Supabase Auth errors to clearer hints (especially built-in email quotas). */
function authErrorHint(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("rate limit") && (m.includes("email") || m.includes("mail"))) {
    return (
      "Supabase’s built-in email quota was exceeded (very low on free tier). " +
      "Turn off “Confirm email” under Dashboard → Authentication → Providers → Email so sign-up does not send mail. " +
      "Or wait for the window to reset, or configure Custom SMTP (Project Settings → Authentication)."
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
    [sb]
  );

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!isValidUsername(username)) {
      setAuthError("Username: 3–32 characters, lowercase letters, digits, and underscores only.");
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setAuthError(pwError);
      return;
    }
    if (password !== password2) {
      setAuthError("Passwords do not match.");
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
          "No session after sign-up. Confirm your email if required, or ask the site admin to enable sign-in without email confirmation for this project."
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
      setAuthError(err instanceof Error ? authErrorHint(err.message) : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!isValidUsername(username)) {
      setAuthError("Username: 3–32 characters, lowercase letters, digits, and underscores only.");
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
      setAuthError(err instanceof Error ? authErrorHint(err.message) : "Sign in failed.");
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
      setAuthError("Wrong password, or your cloud vault was encrypted with a different password.");
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
    [sb, session?.user?.id]
  );

  const onChangePassword = useCallback(
    async (oldPw: string, newPw: string) => {
      if (!session?.user?.id) throw new Error("no session");
      const s = lastBlobRef.current;
      if (!s) throw new Error("no blob");
      await unlockVault(oldPw, s);
      const blob = await resealWithNewPassword(oldPw, newPw, s);
      // Upload re-encrypted vault before changing auth password to avoid desync.
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
    [sb, session?.user?.id]
  );

  const onImportReplace = useCallback(
    async (_imported: VaultData, blob: StoredBlob) => {
      if (!session?.user?.id) return;
      lastBlobRef.current = blob;
      await upsertVaultPayload(sb, session.user.id, blob);
    },
    [sb, session?.user?.id]
  );

  const onLock = () => {
    lastBlobRef.current = null;
    setVaultPassword(null);
    setVaultData(null);
  };

  if (init) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-muted-foreground">
        <p>Loading…</p>
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
            <span className="max-w-[220px] truncate text-xs text-muted-foreground sm:text-sm">{displayUsername(session.user)}</span>
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
        <Card className="w-full max-w-md border-border/80 shadow-2xl">
          <CardHeader>
            <CardTitle>Unlock vault</CardTitle>
            <CardDescription>Signed in as {displayUsername(session.user)}. Enter your account password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlockWithPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="unlock-pw">Password</Label>
                <PasswordInput id="unlock-pw" value={password} onChange={setPassword} autoComplete="current-password" required />
              </div>
              {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="min-h-11 flex-1" disabled={busy}>
                  Unlock
                </Button>
                <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => void handleLogout()}>
                  Different account
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
      <Card className="w-full max-w-md border-border/80 shadow-2xl">
        <CardHeader>
          <CardTitle>NotANote</CardTitle>
          <CardDescription>
            Sign in to sync your encrypted vault across devices. Username only—no email verification; the app maps your
            username to an internal id required by Supabase (no messages are sent).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => { setTab(v); setAuthError(null); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4 space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username-login">Username</Label>
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
                  <Label htmlFor="lpw">Password</Label>
                  <PasswordInput id="lpw" value={password} onChange={setPassword} autoComplete="current-password" required resetKey={tab} />
                </div>
                {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                <Button type="submit" className="w-full min-h-11" disabled={busy}>
                  Log in
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register" className="mt-4 space-y-4">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username-register">Username</Label>
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
                  <p className="text-xs text-muted-foreground">3–32 chars: a–z, 0–9, underscore. Stored as lowercase.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rpw">Password</Label>
                  <PasswordInput id="rpw" value={password} onChange={setPassword} autoComplete="new-password" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rpw2">Confirm password</Label>
                  <PasswordInput id="rpw2" value={password2} onChange={setPassword2} autoComplete="new-password" required />
                </div>
                {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                <Button type="submit" className="w-full min-h-11" disabled={busy}>
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="border-t border-border/60">
          <p className="text-center text-xs text-muted-foreground">Notes are encrypted in your browser before upload.</p>
        </CardFooter>
      </Card>
    </div>
  );
}
