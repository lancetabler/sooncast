import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70; // px pulled (after resistance) to trigger a refresh
const MAX = 110;

/**
 * Native-feel pull-to-refresh for the whole page (body scroll). Only engages when the
 * page is scrolled to the very top and the drag is downward. Returns the current pull
 * distance (for an indicator) and whether a refresh is in flight.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void, enabled: boolean) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const engaged = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const setP = (p: number) => {
      pullRef.current = p;
      setPull(p);
    };

    const onStart = (e: TouchEvent) => {
      if (busy.current || window.scrollY > 0 || e.touches.length !== 1) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      engaged.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || busy.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) {
        if (engaged.current) {
          engaged.current = false;
          setP(0);
        }
        return;
      }
      engaged.current = true;
      setP(Math.min(MAX, dy * 0.5)); // rubber-band resistance
      if (e.cancelable) e.preventDefault(); // stop native scroll while pulling
    };
    const onEnd = async () => {
      if (startY.current == null) return;
      const trigger = engaged.current && pullRef.current >= THRESHOLD;
      startY.current = null;
      engaged.current = false;
      if (trigger) {
        busy.current = true;
        setRefreshing(true);
        setP(48);
        try {
          await onRefresh();
        } finally {
          busy.current = false;
          setRefreshing(false);
          setP(0);
        }
      } else {
        setP(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, onRefresh]);

  return { pull, refreshing };
}
