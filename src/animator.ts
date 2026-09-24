import * as THREE from "three";
import { HUE, type ClipName } from "./config";

type PlayOptions = {
  fade?: number;
  /** Start this many seconds into the clip. */
  from?: number;
  timeScale?: number;
  /** Freeze on this time once reached (e.g. the mid-air pose). */
  holdAt?: number;
  /** Restart even if this clip is already current. */
  restart?: boolean;
};

/** Thin crossfading layer over an AnimationMixer: one "current" clip at a time. */
export class Animator {
  current: ClipName;
  private holdAt: number | undefined;

  constructor(
    readonly mixer: THREE.AnimationMixer,
    readonly actions: Record<ClipName, THREE.AnimationAction>,
    initial: ClipName,
  ) {
    this.current = initial;
  }

  get action() {
    return this.actions[this.current];
  }

  get time() {
    return this.action.time;
  }

  play(name: ClipName, { fade = HUE.crossfade, from = 0, timeScale = 1, holdAt, restart = false }: PlayOptions = {}) {
    this.holdAt = holdAt;
    const to = this.actions[name];
    if (name === this.current && !restart) {
      to.timeScale = timeScale;
      return;
    }
    const prev = this.action;
    to.reset();
    to.time = from;
    to.timeScale = timeScale;
    to.setEffectiveWeight(1).play();
    if (prev !== to) {
      if (fade > 0) prev.crossFadeTo(to, fade, false);
      else prev.stop();
    }
    this.current = name;
  }

  setTimeScale(timeScale: number) {
    if (this.holdAt === undefined) this.action.timeScale = timeScale;
  }

  /** Stops everything and shows `name` at `from`, with no blend. */
  snap(name: ClipName, from = 0) {
    this.mixer.stopAllAction();
    this.holdAt = undefined;
    const a = this.actions[name];
    a.reset();
    a.time = from;
    a.timeScale = 1;
    a.setEffectiveWeight(1).play();
    this.current = name;
    this.mixer.update(0);
  }

  update(dt: number) {
    this.mixer.update(dt);
    if (this.holdAt !== undefined && this.action.time >= this.holdAt) {
      this.action.time = this.holdAt;
      this.action.timeScale = 0;
    }
  }
}
