"use client";

import { theme } from "../src/ui/theme";

/**
 * What the player sees if the game cannot start or stops: most often the level's model could not be downloaded (a bad connection). The same plain look as the "needs WebGL"
 * message; Reload starts again from the page (a fresh download, not a retry of the one that failed).
 */
export default function GameError() {
  return (
    <div className="ui fixed inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: theme.paper, color: theme.ink }}>
      <div className="text-2xl font-bold">{theme.wordmark}</div>
      <p className="max-w-xs text-sm" style={{ color: theme.muted }}>
        The game could not load. Check your connection and try again.
      </p>
      <button type="button" onClick={() => window.location.reload()} className="ui-cta text-sm">
        reload
      </button>
    </div>
  );
}
