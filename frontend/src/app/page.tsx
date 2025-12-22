import Link from "next/link";

export default function HomePage() {
  return (
    <main className="pp-page">
      <div className="pp-container">
        <div className="pp-topbar">
          <div className="pp-brand">
            <div className="pp-title">PairPilot IDE</div>
            <div className="pp-subtle">Collaborative coding, shared runs</div>
          </div>
          <div className="pp-row">
            <Link className="pp-linkButton" href="/login">
              Sign in
            </Link>
            <Link className="pp-linkButton" href="/signup">
              Sign up
            </Link>
          </div>
        </div>

        <div className="pp-card">
          <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-1px" }}>
            Real-time collaborative IDE
          </h1>
          <p className="pp-subtle" style={{ marginTop: 10, maxWidth: 760 }}>
            A Google-Docs-style editor with shared live output. Runs happen in
            the browser (Web Workers, Pyodide for Python).
          </p>

          <div className="pp-row" style={{ marginTop: 16 }}>
            <Link className="pp-button" href="/app">
              Open app
            </Link>
            <Link className="pp-buttonSecondary" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
