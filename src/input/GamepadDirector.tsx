"use client";

import { useEffect } from "react";
import { useGame } from "../store";
import { PAD, pollGamepad } from "./gamepad";

/** Controller buttons for menus: A begins / plays again / resumes, Menu pauses, View restarts. */
export function GamepadDirector() {
  useEffect(() => {
    let raf = 0;
    let prev: boolean[] = [];
    const tick = () => {
      const { buttons } = pollGamepad();
      const pressed = (b: number) => !!buttons[b] && !prev[b];
      const g = useGame.getState();
      if (pressed(PAD.A) && g.phase === "ready") g.setPhase("rising");
      else if (pressed(PAD.A) && g.phase === "won") g.restart();
      else if (pressed(PAD.A) && g.paused) g.setPaused(false);
      else if (pressed(PAD.MENU) && g.phase === "playing") g.setPaused(!g.paused);
      else if (pressed(PAD.VIEW) && (g.phase === "playing" || g.phase === "won")) g.restart();
      prev = buttons;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}
