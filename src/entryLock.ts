import { deriveKey, randomSalt, saltFromB64, saltToB64 } from "./crypto";
import type { VaultEntry } from "./types";

const IV_LEN = 12;
const VERIFIER_BITS = 256;

export type LockPinConfig = {
  saltB64: string;
  verifierB64: string;
};

export type EntrySecrets = {
  title: string;
  content?: string;
  url?: string;
  username?: string;
  password?: string;
};

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)!;
  return bytes.buffer;
}

async function deriveVerifierBits(pin: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 210_000,
      hash: "SHA-256",
    },
    keyMaterial,
    VERIFIER_BITS,
  );
}

function constantTimeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const ba = new Uint8Array(a);
  const bb = new Uint8Array(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i]! ^ bb[i]!;
  return diff === 0;
}

export async function createLockPinConfig(pin: string): Promise<LockPinConfig> {
  const salt = randomSalt();
  const verifier = await deriveVerifierBits(pin, salt);
  return {
    saltB64: saltToB64(salt),
    verifierB64: bufToB64(verifier),
  };
}

export async function verifyLockPin(pin: string, config: LockPinConfig): Promise<boolean> {
  const salt = saltFromB64(config.saltB64);
  const got = await deriveVerifierBits(pin, salt);
  const expected = b64ToBuf(config.verifierB64);
  return constantTimeEqual(got, expected);
}

export async function deriveLockKey(pin: string, saltB64: string): Promise<CryptoKey> {
  return deriveKey(pin, saltFromB64(saltB64));
}

export async function encryptEntrySecrets(
  secrets: EntrySecrets,
  key: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const plain = new TextEncoder().encode(JSON.stringify(secrets));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain),
  );
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return bufToB64(combined.buffer);
}

export async function decryptEntrySecrets(
  payloadB64: string,
  key: CryptoKey,
): Promise<EntrySecrets> {
  const combined = new Uint8Array(b64ToBuf(payloadB64));
  const iv = combined.slice(0, IV_LEN);
  const cipher = combined.slice(IV_LEN);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  const json = new TextDecoder().decode(plainBuf);
  return JSON.parse(json) as EntrySecrets;
}

export function entrySecretsFromEntry(entry: VaultEntry): EntrySecrets {
  return {
    title: entry.title,
    content: entry.content,
    url: entry.url,
    username: entry.username,
    password: entry.password,
  };
}

export function applySecretsToEntry(entry: VaultEntry, secrets: EntrySecrets): VaultEntry {
  return {
    ...entry,
    title: secrets.title,
    content: secrets.content,
    url: secrets.url,
    username: secrets.username,
    password: secrets.password,
  };
}

export async function lockEntry(
  entry: VaultEntry,
  key: CryptoKey,
): Promise<VaultEntry> {
  const lockedPayload = await encryptEntrySecrets(entrySecretsFromEntry(entry), key);
  return {
    id: entry.id,
    type: entry.type,
    title: "",
    updatedAt: Date.now(),
    folderId: entry.folderId,
    locked: true,
    lockedPayload,
  };
}

export async function unlockEntrySecrets(
  entry: VaultEntry,
  key: CryptoKey,
): Promise<EntrySecrets> {
  if (!entry.locked || !entry.lockedPayload) {
    return entrySecretsFromEntry(entry);
  }
  return decryptEntrySecrets(entry.lockedPayload, key);
}

export function isEntryLocked(entry: VaultEntry): boolean {
  return Boolean(entry.locked && entry.lockedPayload);
}
