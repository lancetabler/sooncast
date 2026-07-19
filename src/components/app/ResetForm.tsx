"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";

export default function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card/70 p-6 text-center">
        <h1 className="text-lg font-semibold">Invalid link</h1>
        <p className="mt-2 text-sm text-muted-foreground">This reset link is missing its token.</p>
        <Link href="/" className="mt-4 inline-block text-primary">Back to sign in</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't reset");
      toast.success("Password updated");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur">
      <h1 className="mb-1 text-xl font-bold tracking-tight">Choose a new password</h1>
      <p className="mb-5 text-sm text-muted-foreground">You&apos;ll be signed in once it&apos;s set.</p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Saving…" : "Set password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
