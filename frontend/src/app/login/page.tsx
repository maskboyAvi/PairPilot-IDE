import Link from "next/link";
import { signInWithPassword } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const errorFromQuery = searchParams?.error;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>PairPilot IDE</h1>
      <p style={{ marginTop: 8 }}>Sign in to continue.</p>

      <form
        action={signInWithPassword}
        style={{ marginTop: 16, maxWidth: 360 }}
      >
        <label style={{ display: "block", marginBottom: 8 }}>
          Email
          <input
            name="email"
            type="email"
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            placeholder="you@example.com"
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Password
          <input
            name="password"
            type="password"
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            placeholder="••••••••"
          />
        </label>

        {errorFromQuery ? (
          <p style={{ color: "crimson", marginTop: 8 }}>{errorFromQuery}</p>
        ) : null}

        <button type="submit" style={{ marginTop: 12, padding: "8px 12px" }}>
          Sign in
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Don’t have an account yet? Create one in Supabase Auth (we’ll add signup
        UI soon).
      </p>

      <p style={{ marginTop: 16 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
