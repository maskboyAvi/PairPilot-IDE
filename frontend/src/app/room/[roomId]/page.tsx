import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CollaborativeMonaco from "@/components/CollaborativeMonaco";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const shareUrl = baseUrl ? `${baseUrl}/room/${roomId}` : `/room/${roomId}`;

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
            <div className="pp-subtle">
              Room code: <strong>{roomId}</strong>
            </div>
          </div>
          <div className="pp-row" style={{ justifyContent: "flex-end" }}>
            <details>
              <summary className="pp-linkButton" style={{ cursor: "pointer" }}>
                Share
              </summary>
              <div className="pp-panel" style={{ marginTop: 10, width: 360 }}>
                <div className="pp-subtle" style={{ marginBottom: 8 }}>
                  Share this link to let others join as viewer.
                </div>
                <input
                  className="pp-input"
                  readOnly
                  value={shareUrl}
                  aria-label="Room link"
                />
              </div>
            </details>

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
