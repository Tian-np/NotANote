import type { VaultEntry } from "@/types";

export const DND_ENTRY_MIME = "application/x-notanote-entry-id";

export const selectLikeClass =
  "flex h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function previewLine(e: VaultEntry): string {
  if (e.type === "note") {
    const line = (e.content ?? "").split("\n")[0]?.trim() ?? "";
    if (!line) return "";
    return line.length > 100 ? `${line.slice(0, 100)}…` : line;
  }
  const host = hostnameFromUrl(e.url?.trim() ?? "");
  const user = e.username?.trim();
  if (host && user) return `${host} · ${user}`;
  if (host) return host;
  if (user) return user;
  return "";
}

function hostnameFromUrl(raw: string): string {
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname;
  } catch {
    return raw.slice(0, 80);
  }
}

export function HighlightText({ text, needle }: { text: string; needle: string }) {
  const q = needle.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={i}
            className="rounded bg-primary/25 px-0.5 text-inherit"
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
