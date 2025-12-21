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

function deriveUsername(email: string, rawUsername: string): string {
  const provided = normalizeUsername(rawUsername);
  if (provided) return provided.slice(0, 10);
  const local = String(email.split("@")[0] || "user");
  return normalizeUsername(local).slice(0, 10) || "user";
}

export async function signUpWithPassword(formData: FormData) {
  const rawUsername = String(formData.get("username") || "");
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    redirect("/signup?error=Email%20and%20password%20are%20required");
  }

  const supabase = await createSupabaseServerClient();

  const username = deriveUsername(email, rawUsername);
  if (String(rawUsername || "").trim().length > 10) {
    redirect("/signup?error=Username%20must%20be%20at%20most%2010%20characters");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
      },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Best-effort profile mapping so users can sign in with username later.
  // This requires a `profiles` table (id, email, username) with appropriate RLS.
  try {
    if (data.user) {
      await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          email,
          username,
        },
        { onConflict: "id" }
      );
    }
  } catch {
    // ignore if profiles table/RLS isn't set up yet
  }

  // Many Supabase projects require email confirmation.
  // In that case, there may be no active session yet.
  if (!data.session) {
    redirect(
      "/login?message=Account%20created.%20Please%20confirm%20your%20email%20then%20sign%20in."
    );
  }

  redirect("/app");
}
