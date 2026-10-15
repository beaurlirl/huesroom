"use client";

import { useEffect } from "react";
import { useGame, winConfirmReady } from "../store";
import { moveMenuFocus, pressMenuFocus } from "../ui/menuNav";
import { PAD, pollGamepad } from "./gamepad";

/** Controller buttons for menus: A begins / plays again / resumes, Menu pauses, View restarts. */
export function GamepadDirector() {
  useEffect(() => {
    let raf = 0;
    let prev: boolean[] = [];
    let prevStick = 0;
    const tick = () => {
      const { buttons, moveZ } = pollGamepad();
      const pressed = (b: number) => !!buttons[b] && !prev[b];
      const g = useGame.getState();
      // The home menu: the D-pad or the left stick walks the buttons, A presses the one in focus.
      const stick = moveZ > 0.6 ? 1 : moveZ < -0.6 ? -1 : 0;
      const stickEdge = stick !== 0 && stick !== prevStick;
      prevStick = stick;
      if (g.phase === "ready" && g.menuOpen) {
        if (pressed(PAD.UP) || (stickEdge && stick > 0)) moveMenuFocus(-1);
        else if (pressed(PAD.DOWN) || (stickEdge && stick < 0)) moveMenuFocus(1);
        else if (pressed(PAD.A)) pressMenuFocus();
      } else if (pressed(PAD.A) && g.phase === "ready") g.setPhase("rising");
      else if (pressed(PAD.A) && g.phase === "won") {
        if (winConfirmReady()) g.restart();
      }
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
