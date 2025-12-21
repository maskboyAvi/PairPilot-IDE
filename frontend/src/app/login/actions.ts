"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeUsername(raw: string): string {
  const trimmed = raw.trim();
  const cleaned = trimmed
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_\-]/g, "");
  return cleaned;
}

function deriveUsername(email: string, rawFromMeta: unknown): string {
  const meta = typeof rawFromMeta === "string" ? rawFromMeta : "";
  const provided = normalizeUsername(meta);
  if (provided) return provided.slice(0, 10);
  const local = String(email.split("@")[0] || "user");
  return normalizeUsername(local).slice(0, 10) || "user";
}

export async function signInWithPassword(formData: FormData) {
  const identifier = String(formData.get("identifier") || "").trim();
  const password = String(formData.get("password") || "");

  if (!identifier || !password) {
    redirect("/login?error=Email%20or%20username%20and%20password%20are%20required");
  }

  const supabase = await createSupabaseServerClient();

  let email = identifier;
  if (!identifier.includes("@")) {
    const username = normalizeUsername(identifier);
    if (!username) {
      redirect("/login?error=Invalid%20username");
    }

    // Resolve username -> email via profiles table.
    // This requires a `profiles` table (id, email, username) with suitable RLS.
    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("username", username)
      .maybeSingle();

    if (error || !data?.email) {
      redirect(
        "/login?error=Unknown%20username.%20Try%20signing%20in%20with%20email%20first"
      );
    }
    email = data.email;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Best-effort: upsert profile mapping for future username sign-in.
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user?.id && user.email) {
      const username = deriveUsername(
        user.email,
        (user.user_metadata as any)?.username
      );
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email,
          username,
        },
        { onConflict: "id" }
      );
    }
  } catch {
    // ignore if profiles table/RLS isn't set up yet
  }

  redirect("/app");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
