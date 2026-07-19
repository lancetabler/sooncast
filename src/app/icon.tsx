import { ImageResponse } from "next/og";
import { iconMark } from "@/lib/icon-mark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// PNG app icon (favicon + manifest). Android maskable-safe.
export default function Icon() {
  return new ImageResponse(iconMark(512, 0.22), { ...size });
}
