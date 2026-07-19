"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client/api";

const HIGHLIGHTS = [
  { emoji: "🏎️", label: "F1, IMSA & WEC" },
  { emoji: "🏒", label: "NHL & your league" },
  { emoji: "🎾", label: "Tennis & more" },
  { emoji: "👟", label: "Drops & releases" },
];

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (mode === "register") await api.register({ email, password, timezone: tz });
      else await api.login({ email, password });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="radar-glow min-h-dvh w-full">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-10 px-6 py-12 lg:flex-row lg:items-center lg:gap-16">
        {/* Hero */}
        <div className="flex-1">
          <div className="mb-6 flex items-center gap-3">
            <RadarMark />
            <span className="text-xl font-bold tracking-tight">Radar</span>
          </div>
          <h1 className="max-w-lg text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Everything you follow,
            <br />
            <span className="text-primary">on one horizon.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Track any event with a date — races, games, matches, drops, deadlines — and get a nudge before it
            starts. Pull whole seasons in automatically. No more missing what you care about.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {HIGHLIGHTS.map((h) => (
              <span
                key={h.label}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-sm text-muted-foreground"
              >
                <span aria-hidden>{h.emoji}</span>
                {h.label}
              </span>
            ))}
          </div>
        </div>

        {/* Auth card */}
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur">
          <div className="mb-5 flex rounded-lg bg-secondary p-1 text-sm">
            <button
              className={`flex-1 rounded-md py-2 font-medium transition ${mode === "register" ? "bg-background shadow" : "text-muted-foreground"}`}
              onClick={() => setMode("register")}
              type="button"
            >
              Create account
            </button>
            <button
              className={`flex-1 rounded-md py-2 font-medium transition ${mode === "login" ? "bg-background shadow" : "text-muted-foreground"}`}
              onClick={() => setMode("login")}
              type="button"
            >
              Sign in
            </button>
          </div>

          <form onSubmit={submit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                />
              </Field>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "One sec…" : mode === "register" ? "Start tracking" : "Sign in"}
              </Button>
            </FieldGroup>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Free to start. Your data stays private to your account.
          </p>
        </div>
      </div>
    </div>
  );
}

function RadarMark() {
  return (
    <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-white shadow-lg">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" opacity=".35" />
        <circle cx="12" cy="12" r="5" opacity=".6" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        <path d="M12 12 L20 6" />
      </svg>
    </span>
  );
}
