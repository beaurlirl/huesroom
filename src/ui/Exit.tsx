"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { Frost, GLASS } from "./Frost";
import { theme } from "./theme";

/** Fog to white, then the leaving line, then navigate. */
const EXIT = { fogMs: 1100, lineDelay: 0.55, navigateMs: 2300 };

const useExit = create<{ target: string | null; go: (url: string) => void; cancel: () => void }>((set) => ({
  target: null,
  go: (url) => set({ target: url }),
  cancel: () => set({ target: null }),
}));

/** Leave the game through the exit animation (use as an <a> onClick so the href still works without JS). */
export function exitTo(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab / window: no animation
  e.preventDefault();
  useExit.getState().go(e.currentTarget.href);
}

/** The exit screen: the room fogs over into white glass, "hue leaves home" condenses, then we go. */
export function ExitScreen() {
  const target = useExit((s) => s.target);
  const cancel = useExit((s) => s.cancel);

  useEffect(() => {
    if (!target) return;
    const t = setTimeout(() => window.location.assign(target), EXIT.navigateMs);
    return () => clearTimeout(t);
  }, [target]);

  // Coming back with the browser's back button restores this page from cache: clear the glass.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) cancel();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [cancel]);

  const host = target ? new URL(target).host : "";
  return (
    <Frost
      level={target ? "white" : "clear"}
      ms={target ? EXIT.fogMs : 500}
      className="ui fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 px-6 text-center"
      style={{ pointerEvents: target ? "auto" : "none" }}
    >
      {target && (
        <>
          <span className="text-5xl font-bold leading-[0.9] sm:text-7xl" style={{ animation: GLASS.in(1, EXIT.lineDelay) }}>
            {theme.wordmark}
          </span>
          <div className="flex items-center gap-3 text-sm sm:text-base" style={{ color: theme.muted, animation: GLASS.in(0.9, EXIT.lineDelay + 0.45) }}>
            <span className="ui-rule hidden w-10 sm:block" />
            <span>next stop · {host}</span>
            <span className="ui-rule hidden w-10 sm:block" />
          </div>
        </>
      )}
    </Frost>
  );
}
