"use client";

import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";
import { trackPlayStart } from "../analytics";
import { useIsTouch } from "../Hud";
import { INTRO } from "../config";
import { RESET_FADE_MS, useGame } from "../store";
import { Frost, GLASS } from "./Frost";
import { theme } from "./theme";

/** Loading screen → fade from white with the title → `begin` prompt. */
export function Overlay() {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const { progress } = useProgress();
  const touch = useIsTouch();
  const runId = useGame((s) => s.runId);
  // "card": the title card on white; "reveal": fading out to Hue on the chair.
  const [stage, setStage] = useState<"card" | "reveal">("card");
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
  // Intro timeline: title card on white → fade out to Hue on the chair → begin prompt.
  // Replays (Play again / R) skip the card so they stay quick.
  useEffect(() => {
    if (phase !== "intro") return;
    const hold = runId === 0 ? INTRO.cardHold : 0;
    const reveal = setTimeout(() => setStage("reveal"), hold * 1000);
    const ready = setTimeout(
      () => {
        setPhase("ready");
        setStage("card");
      },
      (hold + INTRO.fadeFromWhite) * 1000,
    );
    return () => {
      clearTimeout(reveal);
      clearTimeout(ready);
    };
  }, [phase, setPhase, runId]);

  // Any key / tap begins.
  useEffect(() => {
    if (phase !== "ready") return;
    const begin = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || e.metaKey || e.ctrlKey)) return;
      trackPlayStart();
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
  const white = loading || phase === "resetting" || (phase === "intro" && stage === "card");
  const leavingCard = phase === "intro" && stage === "reveal";

  const prompt = touch ? "tap to begin" : pad ? "press A to begin" : "press any key";

  return (
    <div className="ui pointer-events-none fixed inset-0 select-none" style={{ color: theme.ink }}>
      {/* White glass: loading screen and title card, then it clears to reveal the start shot.
          A restart fogs back over to white before the room resets behind it. */}
      <Frost
        level={white ? "white" : "clear"}
        ms={phase === "resetting" ? RESET_FADE_MS : INTRO.fadeFromWhite * 1000}
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        {/* Title card: condenses out of the white, then dissolves as the glass clears. */}
        {phase === "intro" && runId === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
            <h1
              className="text-5xl font-bold leading-[0.9] sm:text-7xl md:text-8xl"
              style={{ animation: leavingCard ? GLASS.out(INTRO.titleOut) : GLASS.in(INTRO.titleIn) }}
            >
              {theme.wordmark}
            </h1>
            <div
              className="flex items-center gap-3 text-sm sm:text-base"
              style={{
                color: theme.muted,
                animation: leavingCard ? GLASS.out(INTRO.titleOut, 0.08) : GLASS.in(INTRO.creditIn, INTRO.creditDelay),
              }}
            >
              <span className="ui-rule hidden w-10 sm:block" />
              <span>{INTRO.credit}</span>
              <span className="ui-rule hidden w-10 sm:block" />
            </div>
          </div>
        )}
        <div
          className="flex w-64 flex-col gap-3"
          style={{ animation: loading ? GLASS.in(0.6) : GLASS.out(0.5), visibility: loading || (phase === "intro" && runId === 0) ? "visible" : "hidden" }}
        >
          <span className="text-3xl font-bold leading-none">{theme.loadingMark}</span>
          <div className="relative h-px w-full" style={{ background: "rgba(10,10,10,0.15)" }}>
            <div className="absolute inset-y-0 left-0" style={{ width: `${progress}%`, background: theme.ink, transition: "width 0.2s" }} />
          </div>
          <div className="ui-label flex justify-between" style={{ color: theme.muted }}>
            <span>loading</span>
            <span className="tabular-nums">{String(Math.round(progress)).padStart(3, "0")}%</span>
          </div>
        </div>
      </Frost>

      {/* Begin prompt: a small white-glass chip that condenses in and dissolves on begin. */}
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: "calc(12vh + env(safe-area-inset-bottom))" }}>
        {(phase === "ready" || phase === "rising") && (
          <span key={runId} className="frost-chip px-5 py-3 text-sm" style={{ animation: phase === "ready" ? GLASS.in(0.7) : GLASS.out(0.45) }}>
            ({prompt})
          </span>
        )}
      </div>
    </div>
  );
}
