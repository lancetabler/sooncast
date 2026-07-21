"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Something went wrong");
      }
      setState("done");
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3.5 text-sm">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-4" />
        </span>
        <span>
          <b>You&apos;re on the list.</b> We&apos;ll email you the moment the beta opens.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="min-w-0 flex-1 rounded-xl border border-border bg-card/70 px-4 py-3 text-sm outline-none ring-primary/40 transition focus:ring-2"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-violet-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:-translate-y-px hover:shadow-primary/50 disabled:opacity-60"
        >
          {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          Join the beta
        </button>
      </div>
      {state === "error" && <p className="mt-2 text-sm text-destructive">{msg}</p>}
      <p className="mt-2 text-xs text-muted-foreground">Free during beta. No spam — one email when it&apos;s ready.</p>
    </form>
  );
}
