import Link from "next/link";
import { signUpWithPassword } from "./actions";

type SearchParams = {
  error?: string;
  message?: string;
};

export default async function SignupPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const errorFromQuery = searchParams?.error;
  const messageFromQuery = searchParams?.message;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ margin: 0 }}>PairPilot IDE</h1>
      <p style={{ marginTop: 8 }}>Create your account.</p>

      <form
        action={signUpWithPassword}
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

        {messageFromQuery ? (
          <p style={{ color: "green", marginTop: 8 }}>{messageFromQuery}</p>
        ) : null}

        {errorFromQuery ? (
          <p style={{ color: "crimson", marginTop: 8 }}>{errorFromQuery}</p>
        ) : null}

        <button type="submit" style={{ marginTop: 12, padding: "8px 12px" }}>
          Sign up
        </button>
      </form>

      <p style={{ marginTop: 16 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>

      <p style={{ marginTop: 16 }}>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
