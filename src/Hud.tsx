"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { trackHueClick } from "./analytics";
import { useAudioSettings } from "./audio/sfx";
import { OUTRO } from "./config";
import { COIN_COUNT, formatTime, runtime, useGame } from "./store";
import { exitTo } from "./ui/Exit";
import { Frost, GLASS, useFrostPresence } from "./ui/Frost";
import { theme } from "./ui/theme";

const COARSE = "(pointer: coarse)";
export function useIsTouch() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(COARSE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(COARSE).matches,
    () => false,
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Updates the timer text straight from the DOM every frame (no React re-render). */
function Timer() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = formatTime(runtime.elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={ref}>0:00.0</span>;
}

/** A blue-glass plate with a small label over a bold figure (directory's label/title pairs). */
function Plate({ label, children, align = "left" }: { label: string; children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div className={`glass flex min-w-[92px] flex-col gap-1.5 px-3.5 py-2.5 ${align === "right" ? "items-end" : ""}`}>
      <span className="ui-label">{label}</span>
      <span className="text-xl font-bold leading-none tabular-nums sm:text-2xl">{children}</span>
    </div>
  );
}

function Counter() {
  const collected = useGame((s) => s.collected);
  return (
    <Plate label="coins">
      {/* Re-keyed on every coin so the bounce replays. */}
      <span key={collected} className="inline-block origin-left" style={{ animation: collected ? "hud-bounce 0.35s ease-out" : undefined }}>
        {pad2(collected)}
        <span className="opacity-60"> / {COIN_COUNT}</span>
      </span>
    </Plate>
  );
}

function Btn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="ui-btn pointer-events-auto text-sm">
      {children}
    </button>
  );
}

/** Sound and music switches (saved), as bracketed text like the rest of the UI. */
function AudioSwitches() {
  const { sfxMuted, musicMuted, toggleSfx, toggleMusic } = useAudioSettings();
  return (
    <div className="flex gap-4">
      <Btn onClick={toggleSfx}>sound {sfxMuted ? "off" : "on"}</Btn>
      <Btn onClick={toggleMusic}>music {musicMuted ? "off" : "on"}</Btn>
    </div>
  );
}

/** Pause fogs in quickly; the win fogs in slower, like the end of a scene. */
const VEIL_MS = { pause: 600, won: 1200 };

/**
 * Full-screen white frosted glass with a directory-style header row. The room fogs over as it
 * opens and clears as it closes; the text condenses in after the glass and dissolves first.
 */
function Veil({ open, ms, right, children }: { open: boolean; ms: number; right: React.ReactNode; children: React.ReactNode }) {
  const { mounted, leaving, level } = useFrostPresence(open, "frosted", ms);
  if (!mounted) return null;
  const text = (delay: number) => (leaving ? GLASS.out(0.4) : GLASS.in(0.8, delay));
  return (
    <Frost level={level} ms={ms} className="absolute inset-0 flex flex-col" style={{ pointerEvents: leaving ? "none" : "auto" }}>
      <div
        className="flex items-center gap-4"
        style={{
          padding: "max(18px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left))",
          animation: text(ms / 2000),
        }}
      >
        <span className="text-lg font-bold leading-none sm:text-2xl">{theme.wordmark}</span>
        <span className="ui-rule flex-1" />
        <span className="text-sm leading-none">{right}</span>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-5" style={leaving ? { animation: GLASS.out(0.4) } : undefined}>
        {children}
      </div>
    </Frost>
  );
}

/** The unlock pop-up: finishing the room opens the main Hue at hue.onl (owner's request). */
function UnlockCard({ delay }: { delay: number }) {
  const handleUnlockClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackHueClick();
    exitTo(e);
  };
  return (
    <div className="flex w-full flex-col gap-4 p-5 sm:p-6" style={{ background: theme.paper, color: theme.ink, border: `1px solid ${theme.ink}`, animation: GLASS.in(0.9, delay) }}>
      <div className="ui-label flex items-center gap-2" style={{ opacity: 1 }}>
        <span className="inline-block h-1.5 w-1.5" style={{ background: theme.ink }} />
        unlocked
      </div>
      <div className="text-4xl font-bold leading-[0.95] sm:text-5xl">{theme.unlockLabel}</div>
      <p className="text-sm leading-snug" style={{ color: theme.muted, textTransform: "none", letterSpacing: 0 }}>
        You found all {COIN_COUNT} coins. The main Hue is open to you now.
      </p>
      {/* Leaves through the exit animation (fog to white, then go). */}
      <a href={theme.unlockUrl} onClick={handleUnlockClick} className="ui-cta self-start text-sm" style={{ background: theme.ink, color: theme.paper, borderColor: theme.ink }}>
        enter {theme.unlockLabel} →
      </a>
    </div>
  );
}

/**
 * The outro: the room fogs over, "hue leaves home" condenses on the glass with the time, holds,
 * dissolves, and the results settle in beneath it.
 */
export function WinPanel({ share }: { share?: React.ReactNode }) {
  const phase = useGame((s) => s.phase);
  const result = useGame((s) => s.result);
  const restart = useGame((s) => s.restart);
  // The result outlives the "won" phase while the glass clears on a restart.
  const [shownResult, setShownResult] = useState(result);
  if (result && result !== shownResult) setShownResult(result);
  const [stage, setStage] = useState<"title" | "dissolve" | "panel">("title");
  useEffect(() => {
    if (phase !== "won") return;
    const timers = [
      setTimeout(() => setStage("title"), 0),
      setTimeout(() => setStage("dissolve"), OUTRO.titleHold * 1000),
      setTimeout(() => setStage("panel"), (OUTRO.titleHold + OUTRO.titleOut) * 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);
  const r = result ?? shownResult;
  if (!r) return null;
  const t = OUTRO.stagger;
  return (
    <Veil open={phase === "won"} ms={VEIL_MS.won} right={`location 01 · home · all ${COIN_COUNT} coins`}>
      {stage !== "panel" ? (
        <div className="flex flex-col items-center gap-5 text-center">
          <span
            className="text-5xl font-bold leading-[0.9] sm:text-7xl md:text-8xl"
            style={{ animation: stage === "dissolve" ? GLASS.out(OUTRO.titleOut) : GLASS.in(1.1, 0.5) }}
          >
            {theme.wordmark}
          </span>
          <div
            className="flex items-center gap-3 text-sm sm:text-base"
            style={{ color: theme.muted, animation: stage === "dissolve" ? GLASS.out(OUTRO.titleOut, 0.06) : GLASS.in(0.9, 1.1) }}
          >
            <span className="ui-rule hidden w-10 sm:block" />
            <span className="tabular-nums">location 01 · complete · {formatTime(r.time)}</span>
            <span className="ui-rule hidden w-10 sm:block" />
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-6">
          <div className="flex flex-col gap-2" style={{ animation: GLASS.in(0.9) }}>
            <span className="ui-label">your time</span>
            <span className="text-7xl font-bold leading-[0.85] tabular-nums sm:text-8xl">{formatTime(r.time)}</span>
            <span className="text-sm">{r.isBest ? "new best time" : `best ${formatTime(r.best)}`}</span>
          </div>
          <UnlockCard delay={t} />
          {/* Where he goes next: this room is stop one of Hue's journey (user request). */}
          <div className="flex items-start gap-3" style={{ animation: GLASS.in(0.8, t * 2) }}>
            <span className="ui-label mt-0.5 whitespace-nowrap">next</span>
            <span className="ui-rule mt-1.5 w-8 shrink-0" />
            <span className="text-sm leading-snug">follow along for the next locations hue gets to</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2" style={{ animation: GLASS.in(0.8, t * 3) }}>
            <Btn onClick={restart}>play again</Btn>
            {share}
            <span className="flex-1" />
            <AudioSwitches />
          </div>
        </div>
      )}
    </Veil>
  );
}

function PausePanel({ open }: { open: boolean }) {
  const setPaused = useGame((s) => s.setPaused);
  const restart = useGame((s) => s.restart);
  const touch = useIsTouch();
  return (
    <Veil open={open} ms={VEIL_MS.pause} right={<Timer />}>
      <div className="flex w-full max-w-md flex-col gap-6">
        <span className="text-7xl font-bold leading-[0.85] sm:text-8xl" style={{ animation: GLASS.in(0.8, 0.15) }}>
          paused
        </span>
        <div className="ui-rule" />
        <div className="flex flex-wrap gap-x-5 gap-y-2" style={{ animation: GLASS.in(0.7, 0.3) }}>
          <Btn onClick={() => setPaused(false)}>resume</Btn>
          <Btn onClick={restart}>restart</Btn>
        </div>
        <div style={{ animation: GLASS.in(0.7, 0.4) }}>
          <AudioSwitches />
        </div>
        {!touch && (
          <span className="ui-label" style={{ animation: GLASS.in(0.7, 0.5) }}>
            esc / p resume · r restart · wasd move · shift run · space jump
          </span>
        )}
      </div>
    </Veil>
  );
}

/** HUD (prompt 1.9, restyled after directory.onl): coins top-left, time top-right, pause, win. */
export function Hud({ share }: { share?: React.ReactNode }) {
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const touch = useIsTouch();

  const visible = phase === "playing" || phase === "won";
  return (
    <div className="ui pointer-events-none fixed inset-0 select-none" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s" }}>
      <div className="absolute" style={{ top: "max(14px, env(safe-area-inset-top))", left: "max(14px, env(safe-area-inset-left))" }}>
        <Counter />
      </div>
      <div
        className="absolute flex items-start gap-2"
        style={{ top: "max(14px, env(safe-area-inset-top))", right: "max(14px, env(safe-area-inset-right))" }}
      >
        {touch && phase === "playing" && (
          <button type="button" aria-label="Pause" onClick={() => setPaused(true)} className="glass pointer-events-auto px-3 py-2.5 text-xs active:scale-95">
            (pause)
          </button>
        )}
        <Plate label="time" align="right">
          <Timer />
        </Plate>
      </div>
      <PausePanel open={paused && phase === "playing"} />
      <WinPanel share={share} />
    </div>
  );
}
