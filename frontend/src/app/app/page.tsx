import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export default async function AppPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?error=Please%20sign%20in%20first");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>PairPilot IDE</h1>
      <p style={{ marginTop: 8 }}>Signed in as: {data.user.email}</p>

      <form action={signOut} style={{ marginTop: 16 }}>
        <button type="submit" style={{ padding: "8px 12px" }}>
          Sign out
        </button>
      </form>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ margin: 0 }}>Next milestone</h2>
        <p style={{ marginTop: 8 }}>
          Build “Create Room” + join page, then wire Yjs collaboration.
        </p>
      </div>
    </main>
  );
}
