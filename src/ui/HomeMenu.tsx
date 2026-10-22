"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AudioSwitches, Btn, Veil } from "../Hud";
import { PAD, pollGamepad } from "../input/gamepad";
import { LEVELS } from "../levels";
import { formatTime, readBest, readLedger } from "../store";
import { GLASS } from "./Frost";
import { focusMenuPrimary, moveMenuFocus, pressMenuFocus } from "./menuNav";
import { theme } from "./theme";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** How long the menu takes to clear before the chosen location loads (ms). */
const LEAVE_MS = 450;

/**
 * The home menu: the page the game opens on (the plain address, and the app). Nothing of a level is loaded behind it (no scene, no model): it is the locations (with the
 * best time and whether every coin has been banked), the sound and music switches, and the privacy, support and terms pages, which are pages of the game itself (no link
 * leaves it), and at the bottom a small "test the beta" link that opens the unreleased levels (`beta` in levels.ts). Choosing a location loads that one (`?level=<id>`: a fresh load per level, so nothing of another carries over).
 */
export function HomeMenu() {
  const [leaving, setLeaving] = useState(false);
  const [betaOpen, setBetaOpen] = useState(false);

  // What this device remembers, read once (this component only ever renders in the browser).
  const progress = useMemo(() => {
    const ledger = readLedger();
    return LEVELS.filter((l) => l.live).map((l) => ({ level: l, best: readBest(l.id), done: (ledger.levels[l.id]?.coins ?? 0) > 0 }));
  }, []);

  /** Levels not released yet, offered only through the small "test the beta" link at the bottom. */
  const betas = useMemo(() => LEVELS.filter((l) => l.beta), []);

  const play = (id: string) => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("level", id);
      window.location.assign(url.toString());
    }, LEAVE_MS);
  };

  // Without a mouse: the first location has focus once the menu is up; the arrow keys, the pad's D-pad or left stick walk the buttons; Enter or the pad's A presses the one in focus.
  useEffect(() => {
    const focus = setTimeout(focusMenuPrimary, 700);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "ArrowDown" || e.code === "ArrowRight") moveMenuFocus(1);
      else if (e.code === "ArrowUp" || e.code === "ArrowLeft") moveMenuFocus(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    let raf = 0;
    let prev: boolean[] = [];
    let prevStick = 0;
    const tick = () => {
      const { buttons, moveZ } = pollGamepad();
      const pressed = (b: number) => !!buttons[b] && !prev[b];
      const stick = moveZ > 0.6 ? 1 : moveZ < -0.6 ? -1 : 0;
      const stickEdge = stick !== 0 && stick !== prevStick;
      prevStick = stick;
      if (pressed(PAD.UP) || (stickEdge && stick > 0)) moveMenuFocus(-1);
      else if (pressed(PAD.DOWN) || (stickEdge && stick < 0)) moveMenuFocus(1);
      else if (pressed(PAD.A)) pressMenuFocus();
      prev = buttons;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-white" style={{ color: theme.ink }}>
      <Veil open={!leaving} ms={600} right="menu">
        <div data-menu className="flex w-full max-w-md flex-col gap-6">
          <span className="text-5xl font-bold leading-[0.9] sm:text-7xl" style={{ animation: GLASS.in(0.8, 0.1) }}>
            {theme.wordmark}
          </span>
          <div className="ui-rule" />
          <ul className="flex flex-col gap-3" style={{ animation: GLASS.in(0.7, 0.25) }}>
            {progress.map(({ level, best, done }, i) => (
              <li key={level.id} className="flex items-baseline gap-3">
                <span className="ui-label">{pad2(level.number)}</span>
                <span className="text-xl font-bold leading-none">{level.name}</span>
                <span className="ui-rule flex-1" />
                <span className="ui-label whitespace-nowrap tabular-nums" style={{ color: theme.muted }}>
                  {done ? "all coins · " : ""}
                  {best !== null ? `best ${formatTime(best)}` : "not played"}
                </span>
                <Btn primary={i === 0} onClick={() => play(level.id)}>
                  {i === 0 ? "play" : "go"}
                </Btn>
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
          {betas.length > 0 && (
            <div className="flex flex-col gap-2" style={{ animation: GLASS.in(0.7, 0.7) }}>
              <button type="button" aria-expanded={betaOpen} onClick={() => setBetaOpen((o) => !o)} className="ui-btn pointer-events-auto self-start text-sm">
                test the beta
              </button>
              {betaOpen && (
                <div data-beta className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                  <span className="ui-label" style={{ color: theme.muted }}>
                    skateboarding · still being made
                  </span>
                  {betas.map((l) => (
                    <Btn key={l.id} onClick={() => play(l.id)}>
                      {l.name}
                    </Btn>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Veil>
    </div>
  );
}
