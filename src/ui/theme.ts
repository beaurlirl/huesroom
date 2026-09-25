// Branding for the HUD, menus and share card, after directory.onl (owner's style):
// Union, uppercase, hard edges, hairline rules, bracketed buttons, blue glass panels.
// CSS lives in app/globals.css (.ui, .glass, .glass-veil, .ui-btn, .ui-cta); canvas drawing
// (the share card) reads the same values from here.

export const theme = {
  font: "var(--ui-font)",
  /** For canvas: the resolved @font-face family is read from this CSS variable at draw time. */
  fontVar: "--font-union",
  wordmark: "hue's room",
  loadingMark: "hue's room",
  ink: "#0a0a0a",
  paper: "#ffffff",
  blue: "#0047ff",
  blueSoft: "#7aa2ff",
  muted: "rgba(10, 10, 10, 0.55)",
  /** The main site this game unlocks. */
  unlockUrl: "https://hue.onl",
  unlockLabel: "hue.onl",
};
