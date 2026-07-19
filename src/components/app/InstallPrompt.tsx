"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { isStandalone } from "@/lib/client/push";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "cusp_install_dismissed";

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires beforeinstallprompt — show the manual hint after a beat.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (ios) t = setTimeout(() => setShow(true), 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (t) clearTimeout(t);
    };
  }, []);

  function dismiss() {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }
  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md px-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
          <Download className="size-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {isIOS ? (
            <span className="text-muted-foreground">
              Install Cusp: tap <Share className="inline size-3.5 align-text-bottom" /> then{" "}
              <b className="text-foreground">Add to Home Screen</b> — needed for notifications.
            </span>
          ) : (
            <span className="font-medium">Install Cusp for quick access & alerts</span>
          )}
        </div>
        {!isIOS && (
          <button onClick={install} className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Install
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
