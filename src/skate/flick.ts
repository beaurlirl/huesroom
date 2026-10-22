/**
 * The ollie flick: the right stick pulled back and pushed forward again (or the other way round) in one quick movement. Pure, so the rule can be tested on its own.
 *
 * It looks at one number, `v`: +1 with the stick pulled all the way back (toward the player), -1 pushed all the way forward. A flick is `reach` one way and then
 * `cross` the other way within `window` seconds, and it fires once when it completes. A stick that merely springs back to the middle on release does not cross far
 * enough to count, and `cooldown` stops one shaky flick from popping twice.
 *
 * Which trick it is depends on how far the stick leaned to the side on the way (`x`: -1 left, +1 right): leaning left past `lean` is a kickflip, right a heelflip, straight is
 * the plain ollie.
 */
export const FLICK = { reach: 0.6, cross: 0.35, window: 0.45, cooldown: 0.25, lean: 0.5 } as const;

export type FlickResult = false | "ollie" | "kickflip" | "heelflip";

export class FlickDetector {
  private side: 0 | 1 | -1 = 0;
  private lastReach = -Infinity;
  private lastFire = -Infinity;
  /** The widest the stick has leaned to the side since it left the pulled-back position. */
  private lean = 0;

  /** Feed the stick position (`v` up and down, `x` left and right) and the time (s); on the sample where a flick completes, which one it was. */
  update(v: number, now: number, x = 0): FlickResult {
    if (this.side !== 0 && now - this.lastReach > FLICK.window) this.side = 0;
    // The crossing is judged against the side reached before this sample; only then does this sample count as a new reach (a flick that ends at the far edge starts the next one).
    let fired: FlickResult = false;
    if (this.side !== 0 && Math.abs(x) > Math.abs(this.lean)) this.lean = x;
    if (this.side !== 0 && v * this.side <= -FLICK.cross && now - this.lastFire >= FLICK.cooldown) {
      fired = this.lean <= -FLICK.lean ? "kickflip" : this.lean >= FLICK.lean ? "heelflip" : "ollie";
      this.lastFire = now;
      this.side = 0;
    }
    if (v >= FLICK.reach) {
      this.side = 1;
      this.lastReach = now;
      this.lean = 0;
    } else if (v <= -FLICK.reach) {
      this.side = -1;
      this.lastReach = now;
      this.lean = 0;
    }
    return fired;
  }

  reset() {
    this.side = 0;
    this.lastReach = this.lastFire = -Infinity;
    this.lean = 0;
  }
}
