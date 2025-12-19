import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>PairPilot IDE</h1>
      <p style={{ marginTop: 8 }}>
        Room: <strong>{roomId}</strong>
      </p>

      <div style={{ marginTop: 16 }}>
        <p style={{ marginTop: 0 }}>
          Next: we’ll place Monaco here and connect Yjs.
        </p>
        <div
          style={{
            marginTop: 12,
            height: 280,
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <p style={{ margin: 0, color: "#555" }}>Editor placeholder</p>
        </div>
      </div>

      <p style={{ marginTop: 16 }}>
        <Link href="/app">Back to Lobby</Link>
      </p>
    </main>
  );
}
