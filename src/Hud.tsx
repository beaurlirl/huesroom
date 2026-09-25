"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useAudioSettings } from "./audio/sfx";
import { COIN_COUNT, formatTime, runtime, useGame } from "./store";
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

/** Full-screen frosted blue veil with a directory-style header row. */
function Veil({ right, children }: { right: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass-veil pointer-events-auto absolute inset-0 flex flex-col" style={{ animation: "ui-rise 0.35s ease-out" }}>
      <div
        className="flex items-center gap-4"
        style={{ padding: "max(18px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left))" }}
      >
        <span className="text-lg font-bold leading-none sm:text-2xl">{theme.wordmark}</span>
        <span className="ui-rule flex-1" />
        <span className="text-sm leading-none">{right}</span>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-5">{children}</div>
    </div>
  );
}

/** The unlock pop-up: finishing the room opens the main Hue at hue.onl (owner's request). */
function UnlockCard() {
  return (
    <div
      className="flex w-full flex-col gap-4 p-5 sm:p-6"
      style={{ background: theme.paper, color: theme.ink, animation: "ui-rise 0.6s ease-out 0.45s both" }}
    >
      <div className="ui-label flex items-center gap-2" style={{ color: theme.blue, opacity: 1 }}>
        <span className="inline-block h-1.5 w-1.5" style={{ background: theme.blue }} />
        unlocked
      </div>
      <div className="text-4xl font-bold leading-[0.95] sm:text-5xl">{theme.unlockLabel}</div>
      <p className="text-sm leading-snug" style={{ color: theme.muted, textTransform: "none", letterSpacing: 0 }}>
        You found all {COIN_COUNT} coins. The main Hue is open to you now.
      </p>
      <a href={theme.unlockUrl} className="ui-cta self-start text-sm" style={{ background: theme.blue, color: theme.paper, borderColor: theme.blue }}>
        enter {theme.unlockLabel} →
      </a>
    </div>
  );
}

export function WinPanel({ share }: { share?: React.ReactNode }) {
  const result = useGame((s) => s.result);
  const restart = useGame((s) => s.restart);
  if (!result) return null;
  return (
    <Veil right={`all ${COIN_COUNT} coins`}>
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="ui-label">your time</span>
          <span className="text-7xl font-bold leading-[0.85] tabular-nums sm:text-8xl">{formatTime(result.time)}</span>
          <span className="text-sm">{result.isBest ? "new best time" : `best ${formatTime(result.best)}`}</span>
        </div>
        <UnlockCard />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Btn onClick={restart}>play again</Btn>
          {share}
          <span className="flex-1" />
          <AudioSwitches />
        </div>
      </div>
    </Veil>
  );
}

function PausePanel() {
  const setPaused = useGame((s) => s.setPaused);
  const restart = useGame((s) => s.restart);
  const touch = useIsTouch();
  return (
    <Veil right={<Timer />}>
      <div className="flex w-full max-w-md flex-col gap-6">
        <span className="text-7xl font-bold leading-[0.85] sm:text-8xl">paused</span>
        <div className="ui-rule" />
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Btn onClick={() => setPaused(false)}>resume</Btn>
          <Btn onClick={restart}>restart</Btn>
        </div>
        <AudioSwitches />
        {!touch && <span className="ui-label">esc / p resume · r restart · wasd move · shift run · space jump</span>}
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
      {paused && phase === "playing" && <PausePanel />}
      {phase === "won" && <WinPanel share={share} />}
    </div>
  );
}
