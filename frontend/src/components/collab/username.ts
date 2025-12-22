import type { User } from "@supabase/supabase-js";

export function usernameFromUser(user: User | null | undefined): string {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const raw = String(meta.username || "").trim();
  const cleaned = raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_\-]/g, "")
    .slice(0, 10);
  if (cleaned) return cleaned;

  const email = String(user?.email || "");
  const local = email.includes("@") ? email.split("@")[0] : "";
  const fallback = String(local || user?.id || "user")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_\-]/g, "")
    .slice(0, 10);
  return fallback || "user";
}
