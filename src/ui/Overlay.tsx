"use client";

import { useProgress } from "@react-three/drei";
import { useEffect, useState, useSyncExternalStore } from "react";
import { INTRO } from "../config";
import { useGame } from "../store";
import { theme } from "./theme";

const COARSE = "(pointer: coarse)";
function useIsTouch() {
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

/** Loading screen → fade from white with the title → `begin` prompt. */
export function Overlay() {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const { progress } = useProgress();
  const touch = useIsTouch();
  const [titleOut, setTitleOut] = useState(false);
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

  return (
    <div className="pointer-events-none fixed inset-0 select-none" style={{ fontFamily: theme.font, color: theme.ink }}>
      {/* White layer: loading screen, then fades away to reveal the start shot. */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{
          background: theme.paper,
          opacity: loading ? 1 : 0,
          transition: `opacity ${INTRO.fadeFromWhite}s ease-in-out`,
        }}
      >
        <div
          className="flex flex-col items-center gap-3"
          style={{ opacity: loading ? 1 : 0, transition: "opacity 0.3s" }}
        >
          <span className="text-sm tracking-wide">{theme.loadingMark}</span>
          <div className="h-px w-32 overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
            <div className="h-full" style={{ width: `${progress}%`, background: theme.ink, transition: "width 0.2s" }} />
          </div>
        </div>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          opacity: titleVisible ? 1 : 0,
          transition: `opacity ${titleVisible ? 0.6 : INTRO.titleFadeOut}s ease-in-out`,
        }}
      >
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl" style={{ textShadow: theme.halo }}>{theme.wordmark}</h1>
      </div>

      <div
        className="absolute inset-x-0 flex justify-center"
        style={{
          bottom: "calc(14vh + env(safe-area-inset-bottom))",
          opacity: phase === "ready" ? 1 : 0,
          transition: "opacity 0.6s ease-in-out",
        }}
      >
        <span className="rounded-full px-5 py-2 text-sm" style={{ background: theme.pill }}>
          {touch ? "tap to begin" : "press any key"}
        </span>
      </div>
    </div>
  );
}
