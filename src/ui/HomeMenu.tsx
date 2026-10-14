"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AudioSwitches, Btn, Veil } from "../Hud";
import { LEVELS } from "../levels";
import { formatTime, readBest, readLedger, useGame } from "../store";
import { GLASS } from "./Frost";
import { theme } from "./theme";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The home menu: the screen the game opens on (the plain address, and the app). The locations (with the best time and whether every coin has been banked),
 * the sound and music switches, and the privacy, support and terms pages, which are pages of the game itself (no link leaves it). It sits over the first
 * view of the first location where "press any key" would be; choosing another location loads it, choosing this one just begins.
 */
export function HomeMenu() {
  const phase = useGame((s) => s.phase);
  const menuOpen = useGame((s) => s.menuOpen);
  const setMenuOpen = useGame((s) => s.setMenuOpen);
  const setPhase = useGame((s) => s.setPhase);
  const goToLevel = useGame((s) => s.goToLevel);
  const levelId = useGame((s) => s.levelId);
  const open = menuOpen && phase === "ready";

  // What this device remembers, read when the menu opens.
  const progress = useMemo(() => {
    if (!open) return [];
    const ledger = readLedger();
    return LEVELS.filter((l) => l.live).map((l) => ({ level: l, best: readBest(l.id), done: (ledger.levels[l.id]?.coins ?? 0) > 0 }));
  }, [open]);

  const play = (id: string) => {
    if (id === levelId) {
      setMenuOpen(false);
      setPhase("rising");
    } else {
      goToLevel(id);
    }
  };

  return (
    <Veil open={open} ms={600} right="menu">
      <div className="flex w-full max-w-md flex-col gap-6">
        <span className="text-5xl font-bold leading-[0.9] sm:text-7xl" style={{ animation: GLASS.in(0.8, 0.1) }}>
          {theme.wordmark}
        </span>
        <div className="ui-rule" />
        <ul className="flex flex-col gap-3" style={{ animation: GLASS.in(0.7, 0.25) }}>
          {progress.map(({ level, best, done }) => (
            <li key={level.id} className="flex items-baseline gap-3">
              <span className="ui-label">{pad2(level.number)}</span>
              <span className="text-xl font-bold leading-none">{level.name}</span>
              <span className="ui-rule flex-1" />
              <span className="ui-label whitespace-nowrap tabular-nums" style={{ color: theme.muted }}>
                {done ? "all coins · " : ""}
                {best !== null ? `best ${formatTime(best)}` : "not played"}
              </span>
              <Btn onClick={() => play(level.id)}>{level.id === levelId ? "play" : "go"}</Btn>
            </li>
          ))}
        </ul>
        <div style={{ animation: GLASS.in(0.7, 0.4) }}>
          <AudioSwitches />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2" style={{ animation: GLASS.in(0.7, 0.5) }}>
          {(["privacy", "support", "terms"] as const).map((page) => (
            <Link key={page} href={`/${page}/`} className="ui-btn pointer-events-auto text-sm">
              {page}
            </Link>
          ))}
        </div>
        <span className="ui-label" style={{ color: theme.muted, animation: GLASS.in(0.7, 0.6) }}>
          your times and coins stay on this device
        </span>
      </div>
    </Veil>
  );
}
