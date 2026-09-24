"use client";

import { useEffect } from "react";
import { useGame } from "../store";
import { playSfx, setMusicPaused, startMusic, unlockAudio } from "./sfx";

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
    const unsub = useGame.subscribe((s, prev) => {
      if (s.phase === "won" && prev.phase !== "won") playSfx("win");
      if (s.paused !== prev.paused) setMusicPaused(s.paused);
    });
    return () => {
      for (const e of events) window.removeEventListener(e, unlock);
      unsub();
    };
  }, []);
  return null;
}
