const KEY = "huesroom.seen";

let atLoad: boolean | null = null;

/**
 * Whether this device has started the game before (read once per page load, so timings never change mid-visit).
 * Returning players get a shorter title card (see INTRO_QUICK). Kept on the device only, like the best times.
 */
export function playedBeforeAtLoad(): boolean {
  if (atLoad === null) {
    try {
      atLoad = window.localStorage.getItem(KEY) === "1";
    } catch {
      atLoad = false;
    }
  }
  return atLoad;
}

/** Remembers that the player has started the game (called once play begins). */
export function markPlayed() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: they just see the full title card next time.
  }
}
