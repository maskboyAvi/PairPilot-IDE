import Link from "next/link";
import { signInWithPassword } from "./actions";

type SearchParams = {
  error?: string;
  message?: string;
};

export default async function LoginPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await props.searchParams;
  const errorFromQuery = searchParams?.error;
  const messageFromQuery = searchParams?.message;

  return (
    <main className="pp-page">
      <div className="pp-container" style={{ maxWidth: 560 }}>
        <div className="pp-topbar">
          <div className="pp-brand">
            <div className="pp-title">PairPilot IDE</div>
            <div className="pp-subtle">Sign in</div>
          </div>
          <Link className="pp-linkButton" href="/">
            Home
          </Link>
        </div>

        <div className="pp-card">
          <p className="pp-subtle">Sign in to continue.</p>

          <form action={signInWithPassword} style={{ marginTop: 14 }}>
            <label style={{ display: "grid", gap: 8, marginTop: 10 }}>
              <span className="pp-subtle">Email or username</span>
              <input
                className="pp-input"
                name="identifier"
                type="text"
                required
                placeholder="you@example.com or alex"
              />
            </label>

            <label style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <span className="pp-subtle">Password</span>
              <input
                className="pp-input"
                name="password"
                type="password"
                required
                placeholder="••••••••"
              />
            </label>

            {messageFromQuery ? (
              <p style={{ color: "#7CFFB2", marginTop: 10 }}>
                {messageFromQuery}
              </p>
            ) : null}

            {errorFromQuery ? (
              <p style={{ color: "var(--pp-danger)", marginTop: 10 }}>
                {errorFromQuery}
              </p>
            ) : null}

            <div className="pp-row" style={{ marginTop: 14 }}>
              <button type="submit" className="pp-button">
                Sign in
              </button>
              <Link className="pp-buttonSecondary" href="/signup">
                Create account
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
