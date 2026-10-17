import { create } from "zustand";

/**
 * How much post-processing the desktop path draws, for machines that cannot keep up: 2 = everything (ambient shading, bloom, smoothing, 4x multisampling), 1 = no ambient shading
 * and half the multisampling, 0 = just the tone mapping and the colour grade. The frame-rate monitor steps it down before it lowers the resolution, and back up once the frame
 * rate has recovered (Game.tsx). Phones never draw these, so it does nothing there. `?quality=0|1|2` forces one, for tests and for looking at what each tier costs.
 */
export const MAX_QUALITY = 2;

function forced(): number | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("quality");
  if (q === null) return null;
  const n = Number(q);
  return Number.isInteger(n) && n >= 0 && n <= MAX_QUALITY ? n : null;
}

type Quality = {
  level: number;
  /** A tier is forced by the address: the monitor leaves it alone. */
  fixed: boolean;
  /** One tier down / up. False if it is already at the end (or forced), so the caller can lower the resolution instead. */
  down: () => boolean;
  up: () => boolean;
  floor: () => void;
};

export const useQuality = create<Quality>((set, get) => {
  const f = forced();
  return {
    level: f ?? MAX_QUALITY,
    fixed: f !== null,
    down: () => {
      const { level, fixed } = get();
      if (fixed || level <= 0) return false;
      set({ level: level - 1 });
      return true;
    },
    up: () => {
      const { level, fixed } = get();
      if (fixed || level >= MAX_QUALITY) return false;
      set({ level: level + 1 });
      return true;
    },
    floor: () => {
      if (!get().fixed) set({ level: 0 });
    },
  };
});
