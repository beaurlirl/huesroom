/**
 * Coins and speed bonuses. Pure functions (no browser, no imports) so the rules can be tested on their own.
 *
 * - Collecting every coin in a level banks that level's coins once. Replays don't pay them again.
 * - A run's time also earns bonus coins: the faster, the more, up to the level's `bonusMax`.
 * - A replay that beats what you were already paid for pays only the difference, on top of what you earned before.
 *   A slower or equal replay pays nothing and loses nothing.
 */

/** Time limits for a level's speed bonus: at `fast` seconds or less you earn all of `bonusMax`, at `slow` or more none. */
export type Par = { fast: number; slow: number; bonusMax: number };

/** What a player has already been paid on one level. */
export type Progress = { baseBanked: boolean; bonusPaid: number };

export type Reward = { base: number; bonus: number; total: number };

export type Medal = "gold" | "silver" | "bronze" | null;

export const NO_PROGRESS: Progress = { baseBanked: false, bonusPaid: 0 };

/** Bonus coins a run time is worth in total (not what's left to pay): linear between `slow` and `fast`. */
export function bonusFor(time: number, par: Par): number {
  if (!(time > 0) || par.slow <= par.fast) return 0;
  const f = (par.slow - time) / (par.slow - par.fast);
  return Math.round(Math.min(1, Math.max(0, f)) * par.bonusMax);
}

export function medalFor(time: number, par: Par): Medal {
  const f = par.bonusMax > 0 ? bonusFor(time, par) / par.bonusMax : 0;
  return f >= 0.8 ? "gold" : f >= 0.5 ? "silver" : f > 0 ? "bronze" : null;
}

/** Settles a finished run: what it pays now, and the progress to store afterwards. */
export function settleRun(prev: Progress, time: number, levelCoins: number, par: Par): { reward: Reward; next: Progress } {
  const earned = bonusFor(time, par);
  const base = prev.baseBanked ? 0 : levelCoins;
  const bonus = Math.max(0, earned - prev.bonusPaid);
  return {
    reward: { base, bonus, total: base + bonus },
    next: { baseBanked: true, bonusPaid: Math.max(prev.bonusPaid, earned) },
  };
}
