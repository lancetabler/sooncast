import { ImageResponse } from "next/og";
import { iconMark } from "@/lib/icon-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon. iOS ignores SVG icons, so a real PNG here is what makes
// "Add to Home Screen" look right (and it applies its own rounded mask).
export default function AppleIcon() {
  return new ImageResponse(iconMark(180, 0.001), { ...size });
}
