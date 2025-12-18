import type { NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "./src/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // This keeps Supabase auth cookies fresh.
  const { supabase, response } = createSupabaseMiddlewareClient(request);
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
