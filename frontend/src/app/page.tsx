"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

type Feature = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  mediaLabel: string;
  mediaHint: string;
  mediaVideoSrc?: string;
};

function FeatureScroller() {
  const features = useMemo<Feature[]>(
    () => [
      {
        id: "realtime",
        eyebrow: "Realtime collaboration",
        title: "Edit together. Stay in sync.",
        body: "See live cursors and edits as they happen. Pair on a single file like a shared doc — fast, smooth, and built for focus.",
        mediaLabel: "Live editor + cursors",
        mediaHint: "Drop a short screen recording or screenshot here.",
        mediaVideoSrc: "/feature-realtime.mp4",
      },
      {
        id: "runs",
        eyebrow: "Shared output",
        title: "Run code and share results instantly.",
        body: "When someone runs the code, everyone sees the same stdout/stderr and the same run history — perfect for teaching, debugging, and interviews.",
        mediaLabel: "Runs + output",
        mediaHint: "Show the run button + output panels in action.",
        mediaVideoSrc: "/feature-runs.mp4",
      },
      {
        id: "roles",
        eyebrow: "Access control",
        title: "Viewer or editor — you decide.",
        body: "Anyone with the link can join as a viewer. Promote editors when you’re ready, and keep your room organized.",
        mediaLabel: "People + roles",
        mediaHint: "Show the People menu and a role change.",
        mediaVideoSrc: "/feature-roles.mp4",
      },
      {
        id: "persistence",
        eyebrow: "Pick up where you left off",
        title: "Your room remembers.",
        body: "Refresh or come back later — the latest room state and recent runs are saved so your session continues smoothly.",
        mediaLabel: "Room persistence",
        mediaHint: "Show a refresh keeping the same code + runs.",
        mediaVideoSrc: "/feature-persistence.mp4",
      },
    ],
    []
  );

  const rowRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const els = rowRefs.current.filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight || 1;
      const targetY = vh * 0.5;
      const range = vh * 0.55;

      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(center - targetY);
        const t = Math.min(1, dist / range);
        const opacity = Math.max(0, 1 - t * t);

        el.style.setProperty("--pp-row-opacity", opacity.toFixed(3));
        el.style.setProperty("--pp-row-y", `${(1 - opacity) * 14}px`);
      });
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pp-featureScroller" aria-label="Features">
      {features.map((f, idx) => (
        <section
          key={f.id}
          ref={(el) => {
            rowRefs.current[idx] = el;
          }}
          className="pp-featureRow"
          style={{ scrollMarginTop: 120 }}
        >
          <div className="pp-scrollStep">
            <div className="pp-stepContent">
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 950,
                  letterSpacing: "-0.6px",
                }}
              >
                {f.title}
              </div>
              <p
                className="pp-subtle"
                style={{ marginTop: 4, fontSize: 14, lineHeight: 1.8 }}
              >
                {f.body}
              </p>
            </div>
          </div>

          <div
            className="pp-featureMedia"
            aria-label={`Preview: ${f.mediaLabel}`}
          >
            <div className="pp-mediaFrame">
              <div className="pp-previewHeader">
                <div className="pp-dots" aria-hidden="true">
                  <span className="pp-dot" />
                  <span className="pp-dot" />
                  <span className="pp-dot" />
                </div>
                <span className="pp-subtle">Preview</span>
              </div>
              <div className="pp-mediaInner">
                {f.mediaVideoSrc ? (
                  <video
                    className="pp-mediaVideo"
                    src={f.mediaVideoSrc}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={f.mediaLabel}
                  />
                ) : (
                  <div style={{ textAlign: "center", padding: 14 }}>
                    <div style={{ fontWeight: 950, letterSpacing: "-0.4px" }}>
                      {f.mediaLabel}
                    </div>
                    <div className="pp-subtle" style={{ marginTop: 6 }}>
                      {f.mediaHint}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="pp-page">
      <div className="pp-container">
        <header
          className="pp-topbar"
          style={{ position: "sticky", top: 14, zIndex: 5 }}
        >
          <div className="pp-brand">
            <div className="pp-title">PairPilot IDE</div>
          </div>
          <nav className="pp-navLinks" aria-label="Home">
            <Link className="pp-linkButton" href="/login">
              Sign in
            </Link>
            <Link className="pp-linkButton" href="/signup">
              Sign up
            </Link>
          </nav>
        </header>

        <section className="pp-landingHero">
          <div className="pp-pill">Secure • Realtime • Online IDE</div>

          <div className="pp-landingGrid">
            <div className="pp-heroText">
              <h1 className="pp-landingTitle">
                A fast, secure,
                <br /> real‑time collaborative IDE.
              </h1>
              <p className="pp-landingLead">
                Share a room link, collaborate in real time, and keep everyone
                on the same page. Code together, run together, and review recent
                runs — all in one place.
              </p>

              <div className="pp-row" style={{ marginTop: 18 }}>
                <Link className="pp-button" href="/app">
                  Get started
                </Link>
              </div>

              <div className="pp-kpiGrid" aria-label="Highlights">
                <div className="pp-kpi">
                  <div className="pp-kpiVal">Realtime</div>
                  <div className="pp-kpiLabel">
                    Live cursors, edits, and presence
                  </div>
                </div>
                <div className="pp-kpi">
                  <div className="pp-kpiVal">Controlled</div>
                  <div className="pp-kpiLabel">
                    Viewer/editor roles per room
                  </div>
                </div>
                <div className="pp-kpi">
                  <div className="pp-kpiVal">Simple</div>
                  <div className="pp-kpiLabel">
                    Share a code, start collaborating
                  </div>
                </div>
              </div>
            </div>

            <div
              className="pp-sticky pp-heroPreview"
              aria-label="Product preview"
            >
              <div className="pp-previewCard">
                <div className="pp-previewHeader">
                  <div className="pp-dots" aria-hidden="true">
                    <span className="pp-dot" />
                    <span className="pp-dot" />
                    <span className="pp-dot" />
                  </div>
                  <span className="pp-subtle">room: abcd-efgh</span>
                </div>
                <div className="pp-previewBody">
                  <div className="pp-previewSplit">
                    <div className="pp-codeBlock" aria-label="Editor preview">
                      <pre>
                        <span className="pp-codeLine">
                          <span className="pp-codeDim">Aviral</span>
                          <span className="pp-codeDim"> </span>
                          <span className="pp-codeDim">•</span>
                          <span className="pp-codeDim"> </span>
                          <span className="pp-codeDim">Kashish</span>
                          <span className="pp-codeDim"> </span>
                          <span className="pp-codeDim">•</span>
                          <span className="pp-codeDim"> </span>
                          <span className="pp-codeDim">Atharv</span>
                        </span>
                        {"\n\n"}
                        <span className="pp-codeLine">def stats(nums):</span>
                        {"\n"}
                        <span className="pp-codeLine">
                          <span className="pp-codeIndent" />
                          total = sum(nums)
                        </span>
                        {"\n"}
                        <span className="pp-codeLine">
                          <span className="pp-codeIndent" />
                          avg = total / len
                          <span
                            className="pp-cursor pp-cursorC"
                            data-user="Atharv"
                          />
                          (nums)
                        </span>
                        {"\n"}
                        <span className="pp-codeLine">
                          <span className="pp-codeIndent" />
                          return {"{"}&quot;total&quot;: total, &quot;avg&quot;:
                          round(avg, 2){"}"}
                          <span
                            className="pp-cursor pp-cursorA"
                            data-user="Aviral"
                          />
                        </span>
                        {"\n\n"}
                        <span className="pp-codeLine">
                          nums = [12, -3, 7, 7, 19, 4, 19, 2]
                          <span
                            className="pp-cursor pp-cursorB"
                            data-user="Kashish"
                          />
                        </span>
                        {"\n"}
                        <span className="pp-codeLine">print(stats(nums))</span>
                      </pre>
                    </div>
                    <div className="pp-codeBlock" aria-label="Output preview">
                      <pre>{`stdout\n{'total': 67, 'avg': 8.38}\n\n`}</pre>
                    </div>
                  </div>
                  <p className="pp-subtle" style={{ marginTop: 10 }}>
                    Share a room link. Collaborate and run code.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="features"
          className="pp-section"
          style={{ scrollMarginTop: 90 }}
        >
          <h2>Features</h2>
          <FeatureScroller />
        </section>

        <footer className="pp-footer" aria-label="Footer">
          <div>
            <div style={{ fontWeight: 900, letterSpacing: "-0.3px" }}>
              Developed by Aviral Katiyar
            </div>
            <div className="pp-subtle">© {new Date().getFullYear()}</div>
          </div>
          <div className="pp-footerLinks">
            <a
              className="pp-iconLink"
              href="https://github.com/maskboyAvi"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              title="GitHub"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 6.8c.85 0 1.71.11 2.51.34 1.9-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.41.1 2.66.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.74c0 .26.18.57.69.48A10 10 0 0 0 12 2z" />
              </svg>
            </a>
            <a
              className="pp-iconLink"
              href="https://www.instagram.com/maskboy_avi/"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
              title="Instagram"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
                <path d="M16 11.37a4 4 0 1 1-7.37 0 4 4 0 0 1 7.37 0z" />
                <path d="M17.5 6.5h.01" />
              </svg>
            </a>
            <a
              className="pp-iconLink"
              href="mailto:katiyaraviral260@gmail.com"
              aria-label="Email"
              title="Email"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 4h16v16H4z" />
                <path d="M22 6l-10 7L2 6" />
              </svg>
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
