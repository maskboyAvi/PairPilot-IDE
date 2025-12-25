"use client";

import { useState } from "react";

export function CopyButton(props: { value: string; label?: string }) {
  const { value, label = "Copy" } = props;
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="pp-linkButton"
      aria-label={`Copy ${label}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
