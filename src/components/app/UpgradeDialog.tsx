"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import { PRO_FEATURES } from "@/lib/domain/plan";

export function UpgradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const stripeEnabled = process.env.NEXT_PUBLIC_STRIPE_ENABLED === "true";

  async function upgrade() {
    setBusy(true);
    try {
      const res = await api.checkout();
      if (res.url) window.location.href = res.url;
      else toast("Checkout started");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start checkout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Cusp Pro
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            You&apos;ve hit a limit on the free plan. Pro removes the ceilings and unlocks everything.
          </p>
          <ul className="flex flex-col gap-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-primary" /> {f}
              </li>
            ))}
          </ul>
          <Button onClick={upgrade} disabled={busy} className="w-full">
            {busy ? "One sec…" : "Upgrade to Pro"}
          </Button>
          {!stripeEnabled && (
            <p className="text-center text-xs text-muted-foreground">
              Billing isn&apos;t configured on this deployment yet — add your Stripe keys to go live.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
