import type { ReactElement } from "react";

/**
 * The Sooncast radar mark, drawn with plain divs so Satori (next/og) can rasterize it
 * to PNG for favicons, apple-touch-icons and maskable manifest icons.
 * Rings occupy the centre ~78% so it survives Android/iOS icon masking.
 */
export function iconMark(px: number, radius = 0.22): ReactElement {
  const ring = (frac: number, opacity: number) => {
    const s = Math.round(px * frac);
    return {
      position: "absolute" as const,
      width: s,
      height: s,
      borderRadius: 9999,
      border: `${Math.max(2, Math.round(px * 0.012))}px solid rgba(255,255,255,${opacity})`,
    };
  };
  return (
    <div
      style={{
        width: px,
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        borderRadius: Math.round(px * radius),
        background: "linear-gradient(135deg, #5b8cff 0%, #8b5cf6 100%)",
      }}
    >
      <div style={ring(0.7, 0.35)} />
      <div style={ring(0.46, 0.55)} />
      <div style={ring(0.22, 0.8)} />
      {/* sweep line from centre to upper-right */}
      <div
        style={{
          position: "absolute",
          width: Math.round(px * 0.33),
          height: Math.max(2, Math.round(px * 0.02)),
          background: "rgba(255,255,255,0.9)",
          transform: "rotate(-37deg)",
          transformOrigin: "left center",
          left: "50%",
          top: "50%",
          borderRadius: 9999,
        }}
      />
      {/* centre dot */}
      <div
        style={{
          position: "absolute",
          width: Math.round(px * 0.09),
          height: Math.round(px * 0.09),
          borderRadius: 9999,
          background: "#ffffff",
        }}
      />
    </div>
  );
}
