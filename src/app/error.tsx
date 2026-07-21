"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="sooncast-glow flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg shadow-primary/30">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" opacity=".35" />
          <circle cx="12" cy="12" r="5" opacity=".6" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <path d="M12 12 L20 6" />
        </svg>
      </div>
      <div>
        <h1 className="text-lg font-bold tracking-tight">Something went off the radar</h1>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          An unexpected error interrupted things. Try again — your data is safe.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30"
        >
          Try again
        </button>
        <button
          onClick={() => (window.location.href = "/")}
          className="rounded-full border border-border px-5 py-2 text-sm font-medium"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
