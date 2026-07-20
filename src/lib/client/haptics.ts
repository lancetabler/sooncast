// Tiny haptic tap on key actions (Android/most Chromium; a silent no-op on iOS Safari).
export function haptic(pattern: number | number[] = 8): void {
  try {
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }) : null;
    nav?.vibrate?.(pattern);
  } catch {
    /* unsupported — ignore */
  }
}
