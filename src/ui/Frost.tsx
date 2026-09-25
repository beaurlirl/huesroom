"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * White frosted glass over the room (see `.frost` in app/globals.css). The intro, outro, pause,
 * restart and exit screens all move between these three levels, so every transition is the room
 * fogging over into white glass or clearing out of it.
 */
export type FrostLevel = "clear" | "frosted" | "white";

const LEVELS: Record<FrostLevel, { blur: number; veil: number }> = {
  clear: { blur: 0, veil: 0 },
  /** Room still readable behind milky glass (pause, win). */
  frosted: { blur: 26, veil: 0.74 },
  /** Solid white paper (title card, restart, exit). */
  white: { blur: 44, veil: 1 },
};

/** Text timings shared by every screen: condense in, dissolve out. */
export const GLASS = {
  in: (s = 0.9, delay = 0) => `glass-in ${s}s cubic-bezier(0.2, 0.7, 0.2, 1) ${delay}s both`,
  out: (s = 0.6, delay = 0) => `glass-out ${s}s cubic-bezier(0.5, 0, 0.75, 0) ${delay}s both`,
};

export function Frost({
  level,
  ms,
  className = "",
  style,
  children,
}: {
  level: FrostLevel;
  /** Duration of the move to `level`. */
  ms: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { blur, veil } = LEVELS[level];
  // Once fully clear, drop out of the compositor: a full-screen backdrop filter isn't free on phones.
  const [reached, setReached] = useState<FrostLevel>(level);
  useEffect(() => {
    const t = setTimeout(() => setReached(level), level === "clear" ? ms + 50 : 0);
    return () => clearTimeout(t);
  }, [level, ms]);
  const settled = level === "clear" && reached === "clear";
  return (
    <div
      className={`frost ${className}`}
      style={
        {
          "--frost-blur": `${blur}px`,
          "--frost-veil": veil,
          "--frost-ms": `${ms}ms`,
          visibility: settled ? "hidden" : "visible",
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

/**
 * Keeps something mounted while it animates out. `level` starts at "clear" on mount and moves to
 * `to` on the next frame (so the glass fogs in), and back to "clear" while leaving.
 */
export function useFrostPresence(open: boolean, to: FrostLevel, exitMs: number) {
  // `shown` flips a frame after opening (so the fog-in transition has a start value) and stays
  // set through the exit so the component lingers until the glass has cleared.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      let raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setShown(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    const t = setTimeout(() => setShown(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return { mounted: open || shown, leaving: !open, level: (shown && open ? to : "clear") as FrostLevel };
}
