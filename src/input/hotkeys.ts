import { useEffect } from "react";
import { useGame } from "../store";

/** R restarts, Esc/P pause, Space/Enter confirm menus; hiding the tab pauses. */
export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const g = useGame.getState();
      if (e.code === "KeyR" && (g.phase === "playing" || g.phase === "won")) {
        g.restart();
      } else if ((e.code === "Escape" || e.code === "KeyP") && g.phase === "playing") {
        g.setPaused(!g.paused);
      } else if ((e.code === "Space" || e.code === "Enter") && g.phase === "won") {
        g.restart();
      } else if ((e.code === "Space" || e.code === "Enter") && g.paused) {
        g.setPaused(false);
      }
    };
    const onVisibility = () => {
      if (document.hidden) useGame.getState().setPaused(true);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
