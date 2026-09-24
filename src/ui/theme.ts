// Placeholder branding: every colour, font and wordmark used by the HUD, menus and share
// card lives here so the restyle pass touches one file (+ ShareCard.tsx).

export const theme = {
  font: "var(--font-inter), system-ui, sans-serif",
  wordmark: "hue's room",
  loadingMark: "hue",
  ink: "#111111",
  paper: "#ffffff",
  pill: "rgba(255, 255, 255, 0.82)",
  muted: "rgba(17, 17, 17, 0.55)",
  /** Keeps overlay text readable over the busy murals. */
  halo: "0 0 18px rgba(255,255,255,0.95), 0 0 4px rgba(255,255,255,0.9)",
};
