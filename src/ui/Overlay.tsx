"use client";

import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";
import { useIsTouch } from "../Hud";
import { INTRO } from "../config";
import { RESET_FADE_MS, useGame } from "../store";
import { theme } from "./theme";

/** Loading screen → fade from white with the title → `begin` prompt. */
export function Overlay() {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const { progress } = useProgress();
  const touch = useIsTouch();
  const [titleOut, setTitleOut] = useState(false);
  const [pad, setPad] = useState(false);
  useEffect(() => {
    // Browsers only report a pad after its first button press, so poll as well as listen.
    const check = () => setPad(Array.from(navigator.getGamepads?.() ?? []).some((g) => g?.connected));
    const timer = setInterval(check, 500);
    window.addEventListener("gamepadconnected", check);
    window.addEventListener("gamepaddisconnected", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("gamepadconnected", check);
      window.removeEventListener("gamepaddisconnected", check);
    };
  }, []);
  const titleVisible = phase === "intro" && !titleOut;

  // Intro timeline.
  useEffect(() => {
    if (phase !== "intro") return;
    const hide = setTimeout(() => setTitleOut(true), (INTRO.fadeFromWhite + INTRO.titleHold) * 1000);
    const ready = setTimeout(
      () => {
        setPhase("ready");
        setTitleOut(false);
      },
      (INTRO.fadeFromWhite + INTRO.titleHold + INTRO.titleFadeOut) * 1000,
    );
    return () => {
      clearTimeout(hide);
      clearTimeout(ready);
    };
  }, [phase, setPhase]);

  // Any key / tap begins.
  useEffect(() => {
    if (phase !== "ready") return;
    const begin = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || e.metaKey || e.ctrlKey)) return;
      setPhase("rising");
    };
    window.addEventListener("keydown", begin);
    window.addEventListener("pointerdown", begin);
    return () => {
      window.removeEventListener("keydown", begin);
      window.removeEventListener("pointerdown", begin);
    };
  }, [phase, setPhase]);

  const loading = phase === "loading";
  const white = loading || phase === "resetting";

  const prompt = touch ? "tap to begin" : pad ? "press A to begin" : "press any key";

  return (
    <div className="ui pointer-events-none fixed inset-0 select-none" style={{ color: theme.ink }}>
      {/* White layer: loading screen, then fades away to reveal the start shot. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{
          background: theme.paper,
          opacity: white ? 1 : 0,
          transition: `opacity ${phase === "resetting" ? RESET_FADE_MS / 1000 : INTRO.fadeFromWhite}s ease-in-out`,
        }}
      >
        <div className="flex w-64 flex-col gap-3" style={{ opacity: loading ? 1 : 0, transition: "opacity 0.3s" }}>
          <span className="text-3xl font-bold leading-none">{theme.loadingMark}</span>
          <div className="relative h-px w-full" style={{ background: "rgba(10,10,10,0.15)" }}>
            <div className="absolute inset-y-0 left-0" style={{ width: `${progress}%`, background: theme.ink, transition: "width 0.2s" }} />
          </div>
          <div className="ui-label flex justify-between" style={{ color: theme.muted }}>
            <span>loading</span>
            <span className="tabular-nums">{String(Math.round(progress)).padStart(3, "0")}%</span>
          </div>
        </div>
      </div>

      {/* Title: a blue-glass plate in the upper third, clear of Hue in the chair. */}
      <div
        className="absolute inset-x-0 flex justify-center px-4"
        style={{
          top: "18%",
          opacity: titleVisible ? 1 : 0,
          transform: titleVisible ? "none" : "translateY(-6px)",
          transition: `opacity ${titleVisible ? 0.6 : INTRO.titleFadeOut}s ease-in-out, transform 0.6s ease-out`,
        }}
      >
        <div className="glass flex flex-col gap-3 px-6 py-5 sm:px-8">
          <div className="ui-label flex items-center gap-3">
            <span>a hue game</span>
            <span className="ui-rule w-10" />
            <span>11 coins</span>
          </div>
          <h1 className="text-5xl font-bold leading-[0.9] sm:text-7xl">{theme.wordmark}</h1>
        </div>
      </div>

      <div
        className="absolute inset-x-0 flex justify-center"
        style={{
          bottom: "calc(12vh + env(safe-area-inset-bottom))",
          opacity: phase === "ready" ? 1 : 0,
          transition: "opacity 0.6s ease-in-out",
        }}
      >
        <span className="glass px-5 py-3 text-sm" style={{ animation: phase === "ready" ? "ui-rise 0.6s ease-out" : undefined }}>
          ({prompt})
        </span>
      </div>
    </div>
  );
}
