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

const pill = "rounded-full px-3.5 py-1.5 text-sm tabular-nums";

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

function Counter() {
  const collected = useGame((s) => s.collected);
  return (
    <div className={pill} style={{ background: theme.pill }}>
      {/* Re-keyed on every coin so the bounce replays. */}
      <span key={collected} className="inline-block" style={{ animation: collected ? "hud-bounce 0.35s ease-out" : undefined }}>
        ● {collected} / {COIN_COUNT}
      </span>
    </div>
  );
}

function Button({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto rounded-full px-5 py-2 text-sm transition-transform active:scale-95"
      style={primary ? { background: theme.ink, color: theme.paper } : { background: "rgba(17,17,17,0.06)", color: theme.ink }}
    >
      {children}
    </button>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div
        className="pointer-events-auto flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl px-6 py-7 text-center"
        style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 10px 40px rgba(0,0,0,0.12)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function WinPanel({ share }: { share?: React.ReactNode }) {
  const result = useGame((s) => s.result);
  const restart = useGame((s) => s.restart);
  if (!result) return null;
  return (
    <Panel>
      <div className="text-xs uppercase tracking-widest" style={{ color: theme.muted }}>
        all {COIN_COUNT} coins
      </div>
      <div className="text-5xl font-medium tabular-nums tracking-tight">{formatTime(result.time)}</div>
      <div className="text-sm" style={{ color: theme.muted }}>
        {result.isBest ? "new best time" : `best ${formatTime(result.best)}`}
      </div>
      <div className="flex gap-2">
        <Button primary onClick={restart}>
          Play again
        </Button>
        {share}
      </div>
    </Panel>
  );
}

function PausePanel() {
  const setPaused = useGame((s) => s.setPaused);
  const restart = useGame((s) => s.restart);
  const touch = useIsTouch();
  return (
    <Panel>
      <div className="text-2xl font-medium">paused</div>
      <div className="flex gap-2">
        <Button primary onClick={() => setPaused(false)}>
          Resume
        </Button>
        <Button onClick={restart}>Restart</Button>
      </div>
      {!touch && (
        <div className="text-xs" style={{ color: theme.muted }}>
          esc to resume · r to restart
        </div>
      )}
    </Panel>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full active:scale-95"
      style={{ background: theme.pill }}
    >
      {children}
    </button>
  );
}

/** Sound and music toggles (saved). */
function MuteButtons() {
  const { sfxMuted, musicMuted, toggleSfx, toggleMusic } = useAudioSettings();
  const off = <line x1="2" y1="2" x2="12" y2="12" stroke={theme.ink} strokeWidth="1.4" strokeLinecap="round" />;
  return (
    <>
      <IconButton label={sfxMuted ? "Unmute sound" : "Mute sound"} onClick={toggleSfx}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M2 5h2.5L8 2v10L4.5 9H2z" fill={theme.ink} />
          {!sfxMuted && <path d="M10 4.5a3.5 3.5 0 0 1 0 5" stroke={theme.ink} strokeWidth="1.3" fill="none" strokeLinecap="round" />}
          {sfxMuted && off}
        </svg>
      </IconButton>
      <IconButton label={musicMuted ? "Unmute music" : "Mute music"} onClick={toggleMusic}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M5 10.5V3l6-1.2v7" stroke={theme.ink} strokeWidth="1.3" fill="none" />
          <circle cx="3.8" cy="10.6" r="1.6" fill={theme.ink} />
          <circle cx="9.8" cy="9.2" r="1.6" fill={theme.ink} />
          {musicMuted && off}
        </svg>
      </IconButton>
    </>
  );
}

/** Minimal HUD (prompt 1.9): coins top-left, timer top-right, pause, win panel. */
export function Hud({ share }: { share?: React.ReactNode }) {
  const phase = useGame((s) => s.phase);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const touch = useIsTouch();

  const visible = phase === "playing" || phase === "won";
  return (
    <div
      className="pointer-events-none fixed inset-0 select-none"
      style={{ fontFamily: theme.font, color: theme.ink, opacity: visible ? 1 : 0, transition: "opacity 0.4s" }}
    >
      <style>{`@keyframes hud-bounce { 0% { transform: scale(1) } 35% { transform: scale(1.25) } 100% { transform: scale(1) } }`}</style>
      <div
        className="absolute flex items-center gap-2"
        style={{ top: "max(16px, env(safe-area-inset-top))", left: "max(16px, env(safe-area-inset-left))" }}
      >
        <Counter />
      </div>
      <div
        className="absolute flex items-center gap-2"
        style={{ top: "max(16px, env(safe-area-inset-top))", right: "max(16px, env(safe-area-inset-right))" }}
      >
        <MuteButtons />
        <div className={pill} style={{ background: theme.pill }}>
          <Timer />
        </div>
        {touch && phase === "playing" && (
          <button
            type="button"
            aria-label="Pause"
            onClick={() => setPaused(true)}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full active:scale-95"
            style={{ background: theme.pill }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <rect x="2" y="1" width="3" height="10" rx="1" fill={theme.ink} />
              <rect x="7" y="1" width="3" height="10" rx="1" fill={theme.ink} />
            </svg>
          </button>
        )}
      </div>
      {paused && phase === "playing" && <PausePanel />}
      {phase === "won" && <WinPanel share={share} />}
    </div>
  );
}
