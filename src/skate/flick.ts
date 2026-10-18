/**
 * The ollie flick: the right stick pulled back and pushed forward again (or the other way round) in one quick movement. Pure, so the rule can be tested on its own.
 *
 * It looks at one number, `v`: +1 with the stick pulled all the way back (toward the player), -1 pushed all the way forward. A flick is `reach` one way and then
 * `cross` the other way within `window` seconds, and it fires once when it completes. A stick that merely springs back to the middle on release does not cross far
 * enough to count, and `cooldown` stops one shaky flick from popping twice.
 */
export const FLICK = { reach: 0.6, cross: 0.35, window: 0.45, cooldown: 0.25 } as const;

export class FlickDetector {
  private side: 0 | 1 | -1 = 0;
  private lastReach = -Infinity;
  private lastFire = -Infinity;

  /** Feed the stick position and the time (s); true on the sample where a flick completes. */
  update(v: number, now: number): boolean {
    if (this.side !== 0 && now - this.lastReach > FLICK.window) this.side = 0;
    // The crossing is judged against the side reached before this sample; only then does this sample count as a new reach (a flick that ends at the far edge starts the next one).
    let fired = false;
    if (this.side !== 0 && v * this.side <= -FLICK.cross && now - this.lastFire >= FLICK.cooldown) {
      fired = true;
      this.lastFire = now;
      this.side = 0;
    }
    if (v >= FLICK.reach) {
      this.side = 1;
      this.lastReach = now;
    } else if (v <= -FLICK.reach) {
      this.side = -1;
      this.lastReach = now;
    }
    return fired;
  }

  reset() {
    this.side = 0;
    this.lastReach = this.lastFire = -Infinity;
  }
}
