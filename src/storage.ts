import type { VaultData } from "./types";
import {
  decryptVault,
  deriveKey,
  encryptVault,
  randomSalt,
  saltFromB64,
  saltToB64,
} from "./crypto";

const STORAGE_KEY = "notanote_enc_v1";

export interface StoredBlob {
  saltB64: string;
  payloadB64: string;
}

export function loadStored(): StoredBlob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as StoredBlob;
    if (!o.saltB64 || !o.payloadB64) return null;
    return o;
  } catch {
    return null;
  }
}

export function saveStored(blob: StoredBlob): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
}

export function clearStored(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function unlockVault(password: string, stored: StoredBlob): Promise<VaultData> {
  const salt = saltFromB64(stored.saltB64);
  const key = await deriveKey(password, salt);
  return decryptVault(key, stored.payloadB64);
}

export async function sealVault(password: string, data: VaultData): Promise<StoredBlob> {
  const salt = randomSalt();
  const key = await deriveKey(password, salt);
  const payloadB64 = await encryptVault(key, data);
  return { saltB64: saltToB64(salt), payloadB64 };
}

export async function resealWithNewPassword(
  oldPassword: string,
  newPassword: string,
  stored: StoredBlob
): Promise<StoredBlob> {
  const data = await unlockVault(oldPassword, stored);
  return sealVault(newPassword, data);
}
