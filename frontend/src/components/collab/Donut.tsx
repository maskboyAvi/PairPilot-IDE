import React from "react";

function donutParts(
  stdoutBytes: number,
  stderrBytes: number
): {
  outPct: number;
  errPct: number;
} {
  const total = Math.max(1, stdoutBytes + stderrBytes);
  const outPct = Math.round((stdoutBytes / total) * 100);
  const errPct = 100 - outPct;
  return { outPct, errPct };
}

export function Donut({
  stdoutBytes,
  stderrBytes,
}: {
  stdoutBytes: number;
  stderrBytes: number;
}) {
  const size = 34;
  const r = 14;
  const c = 2 * Math.PI * r;
  const { outPct } = donutParts(stdoutBytes, stderrBytes);
  const outLen = (outPct / 100) * c;
  const errLen = c - outLen;
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        stroke="var(--foreground)"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <g transform="rotate(-90 17 17)">
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="4"
          strokeDasharray={`${outLen} ${c}`}
          strokeLinecap="round"
        />
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="#b00020"
          strokeWidth="4"
          strokeDasharray={`${errLen} ${c}`}
          strokeDashoffset={-outLen}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
