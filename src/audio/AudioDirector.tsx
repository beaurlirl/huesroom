"use client";

import { useEffect } from "react";
import { useGame } from "../store";
import { playSfx, setMusicPaused, startMusic, unlockAudio } from "./sfx";

/** Starts audio on the first gesture, plays the win jingle, and pauses sound with the game. */
export function AudioDirector() {
  useEffect(() => {
    // Browsers only allow audio after a user gesture: the begin press is the first one.
    const unlock = () => {
      unlockAudio();
      startMusic();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const unsub = useGame.subscribe((s, prev) => {
      if (s.phase === "won" && prev.phase !== "won") playSfx("win");
      if (s.paused !== prev.paused) setMusicPaused(s.paused);
    });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      unsub();
    };
  }, []);
  return null;
}
