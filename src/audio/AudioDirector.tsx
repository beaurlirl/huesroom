"use client";

import { useEffect } from "react";
import { playedBeforeAtLoad } from "../seen";
import { useGame } from "../store";
import { playSfx, prepareAudio, setMusicPaused, startMusic, unlockAudio } from "./sfx";

/** Starts audio on the first gesture, plays the win jingle, and pauses sound with the game. */
export function AudioDirector() {
  useEffect(() => {
    // Browsers only allow audio after a user gesture: the begin press is the first one.
    const unlock = () => {
      unlockAudio(!useGame.getState().paused);
      startMusic();
    };
    // touchend too: older iOS only unlocks audio inside touchend/click.
    const events = ["pointerdown", "touchend", "keydown"] as const;
    for (const e of events) window.addEventListener(e, unlock);
    // Build the audio engine and the music player behind the title card, so the begin press only has to press play.
    let prep: ReturnType<typeof setTimeout> | undefined;
    const schedulePrepare = (phase: string) => {
      if (prep === undefined && (phase === "intro" || phase === "ready")) prep = setTimeout(prepareAudio, phase === "ready" ? 0 : playedBeforeAtLoad() ? 950 : 2200); // while the title card holds still: 2.2 s on the full card, 0.95 s on the quick one
    };
    schedulePrepare(useGame.getState().phase);
    const unsub = useGame.subscribe((s, prev) => {
      if (s.phase !== prev.phase) schedulePrepare(s.phase);
      if (s.phase === "won" && prev.phase !== "won") playSfx("win");
      if (s.paused !== prev.paused) setMusicPaused(s.paused);
    });
    return () => {
      for (const e of events) window.removeEventListener(e, unlock);
      if (prep !== undefined) clearTimeout(prep);
      unsub();
    };
  }, []);
  return null;
}
