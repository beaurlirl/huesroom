"use client";

import { useEffect } from "react";
import { nextLevel } from "./levels";
import { useGame } from "./store";
import { useLevel } from "./useLevel";

/** Seconds of play before the next level's model starts downloading in the background. */
const IDLE_MS = 10000;

/** Not on data-saver or very slow connections: the level would compete with this one for them. */
function connectionAllowsPrefetch() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(c?.saveData || (c?.effectiveType && /2g$/.test(c.effectiveType)));
}

/**
 * Downloads the next released level's model while the player is busy with this one (10 s into play, or the moment they win), so
 * the jump to it only has to re-check a cached file instead of fetching 3+ MB behind a loading bar. Does nothing on the last level.
 */
export function NextLevelPrefetch() {
  const level = useLevel();
  useEffect(() => {
    const next = nextLevel(level.id);
    if (!next || !connectionAllowsPrefetch()) return;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const go = () => {
      if (started) return;
      started = true;
      fetch(next.room, { priority: "low" } as RequestInit)
        .then((r) => r.arrayBuffer())
        .catch(() => {
          // Offline or blocked: the level just loads normally later.
        });
    };
    const arm = (phase: string) => {
      if (phase === "won") go();
      else if (phase === "playing" && timer === undefined) timer = setTimeout(go, IDLE_MS);
    };
    arm(useGame.getState().phase);
    const unsub = useGame.subscribe((s, prev) => {
      if (s.phase !== prev.phase) arm(s.phase);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [level.id]);
  return null;
}
