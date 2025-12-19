import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>PairPilot IDE</h1>
      <p style={{ marginTop: 8 }}>
        Real-time collaborative editor + secure cloud execution (built
        step-by-step).
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <Link href="/login">Sign in</Link>
        <Link href="/signup">Sign up</Link>
        <Link href="/app">Open app</Link>
      </div>
    </main>
  );
}
