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
    <main className="pp-page">
      <div className="pp-container">
        <div className="pp-topbar">
          <div className="pp-brand">
            <div className="pp-title">PairPilot IDE</div>
            <div className="pp-subtle">Lobby</div>
          </div>
          <div className="pp-row">
            <span className="pp-subtle">{data.user.email}</span>
            <form action={signOut}>
              <button type="submit" className="pp-buttonSecondary">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="pp-card">
          <h1
            style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.6px" }}
          >
            Start a room
          </h1>
          <p className="pp-subtle" style={{ marginTop: 8 }}>
            Anyone can join as a viewer. The owner can promote viewers to
            editors from the participants menu.
          </p>

          <div className="pp-row" style={{ marginTop: 14 }}>
            <form action={createRoom}>
              <button type="submit" className="pp-button">
                Create room
              </button>
            </form>
          </div>
        </div>

        <div className="pp-card">
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Join a room</h2>
          <form
            action="/room"
            method="get"
            className="pp-row"
            style={{ marginTop: 12 }}
          >
            <input
              className="pp-input"
              name="id"
              placeholder="Enter room code (e.g. abcd-efgh)"
              style={{ maxWidth: 360 }}
            />
            <button type="submit" className="pp-button">
              Join
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
