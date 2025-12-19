"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function generateRoomId(): string {
  // Human-friendly, URL-safe id. Not cryptographic (fine for MVP).
  const part = () => Math.random().toString(36).slice(2, 6);
  return `${part()}-${part()}`;
}

export async function createRoom() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login?error=Please%20sign%20in%20first");
  }

  const roomId = generateRoomId();
  redirect(`/room/${roomId}`);
}
