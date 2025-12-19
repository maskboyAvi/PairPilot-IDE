import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { createRoom } from "./actions";

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

      <div style={{ marginTop: 20 }}>
        <h2 style={{ margin: 0 }}>Lobby</h2>
        <p style={{ marginTop: 8 }}>
          Create a room and share the link with a friend.
        </p>

        <form action={createRoom} style={{ marginTop: 12 }}>
          <button type="submit" style={{ padding: "8px 12px" }}>
            Create Room
          </button>
        </form>

        <form
          action="/room"
          method="get"
          style={{
            marginTop: 12,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            name="id"
            placeholder="Enter room id (e.g. abcd-efgh)"
            style={{ padding: 8, minWidth: 240 }}
          />
          <button type="submit" style={{ padding: "8px 12px" }}>
            Join
          </button>
        </form>
      </div>

      <form action={signOut} style={{ marginTop: 16 }}>
        <button type="submit" style={{ padding: "8px 12px" }}>
          Sign out
        </button>
      </form>
    </main>
  );
}
