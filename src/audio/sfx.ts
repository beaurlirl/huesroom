// Sound effects. Sources are chosen in milestone 7 (MP3s from this Mac, approved first);
// until then every call is a no-op, so gameplay code can already trigger them.

export type SfxName = "chime" | "boing" | "thud" | "win" | "step";

export function playSfx(name: SfxName, opts: { pitch?: number; volume?: number } = {}) {
  void name;
  void opts;
}
