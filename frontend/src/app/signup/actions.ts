"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    redirect("/signup?error=Email%20and%20password%20are%20required");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
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
