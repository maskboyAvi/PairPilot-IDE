import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CollaborativeMonaco from "@/components/CollaborativeMonaco";
import { CopyButton } from "@/components/CopyButton";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login?error=Please%20sign%20in%20first");
  }

  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const usernameRaw = typeof meta.username === "string" ? meta.username : "";
  const username = usernameRaw || (data.user.email?.split("@")[0] ?? "user");

  return (
    <main className="pp-page">
      <div className="pp-container">
        <div className="pp-topbar">
          <div className="pp-brand">
            <div className="pp-title">PairPilot IDE</div>
            <div className="pp-subtle">
              Room code: <strong>{roomId}</strong>
            </div>
          </div>
          <div className="pp-row" style={{ justifyContent: "flex-end" }}>
            <span className="pp-subtle">Signed in as {username}</span>

            <CopyButton value={roomId} label="Copy code" />

            <Link href="/app" className="pp-linkButton">
              Back to lobby
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <CollaborativeMonaco roomId={roomId} />
        </div>
      </div>
    </main>
  );
}
