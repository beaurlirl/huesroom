import * as THREE from "three";
import { HUE, type ClipName, type IntroClipName } from "./config";

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
  readonly actions: Partial<Record<ClipName, THREE.AnimationAction>>;

  constructor(
    readonly mixer: THREE.AnimationMixer,
    actions: Partial<Record<ClipName, THREE.AnimationAction>>,
    initial: IntroClipName,
  ) {
    this.actions = actions;
    this.current = initial;
  }

  hasClip(name: ClipName): boolean {
    return name in this.actions;
  }

  addActions(newActions: Partial<Record<ClipName, THREE.AnimationAction>>) {
    Object.assign(this.actions, newActions);
  }

  get action(): THREE.AnimationAction | undefined {
    return this.actions[this.current];
  }

  get time() {
    return this.action?.time ?? 0;
  }

  play(name: ClipName, { fade = HUE.crossfade, from = 0, timeScale = 1, holdAt, restart = false }: PlayOptions = {}) {
    const to = this.actions[name];
    if (!to) {
      // Clip not loaded yet; fall back to idle if available, else skip
      if (name !== "idle" && this.actions.idle) {
        this.play("idle", { fade, timeScale });
      }
      return;
    }
    this.holdAt = holdAt;
    if (name === this.current && !restart) {
      to.timeScale = timeScale;
      return;
    }
    const prev = this.action;
    to.reset();
    to.time = from;
    to.timeScale = timeScale;
    to.setEffectiveWeight(1).play();
    if (prev && prev !== to) {
      if (fade > 0) prev.crossFadeTo(to, fade, false);
      else prev.stop();
    }
    this.current = name;
  }

  setTimeScale(timeScale: number) {
    const a = this.action;
    if (this.holdAt === undefined && a) a.timeScale = timeScale;
  }

  /** Stops everything and shows `name` at `from`, with no blend. */
  snap(name: ClipName, from = 0) {
    const a = this.actions[name];
    if (!a) return;
    this.mixer.stopAllAction();
    this.holdAt = undefined;
    a.reset();
    a.time = from;
    a.timeScale = 1;
    a.setEffectiveWeight(1).play();
    this.current = name;
    this.mixer.update(0);
  }

  update(dt: number) {
    this.mixer.update(dt);
    const a = this.action;
    if (this.holdAt !== undefined && a && a.time >= this.holdAt) {
      a.time = this.holdAt;
      a.timeScale = 0;
    }
  }
}
