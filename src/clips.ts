import * as THREE from "three";
import { CLIMB, HUE, type ClipName } from "./config";

/**
 * Hips translation track layout (armature space, verified in scripts/inspect-clips.mjs):
 *   [0] = forward (Hue's local +X), [1] = sideways, [2] = -up.
 * So "horizontal root motion" is components 0 and 1, and vertical is 2.
 * (CURSOR_HANDOFF.md's helper zeroes 0 and 2, which would strip height instead of sideways drift.)
 */
const HIPS_TRACK = "mixamorigHips.position";
const FWD = 0;
const SIDE = 1;
const UP = 2;

function hipsTrack(clip: THREE.AnimationClip) {
  const track = clip.tracks.find((t) => t.name === HIPS_TRACK);
  if (!track) throw new Error(`${clip.name}: no ${HIPS_TRACK} track`);
  return track;
}

function frame(clip: THREE.AnimationClip, index: "first" | "last") {
  const v = hipsTrack(clip).values;
  const i = index === "first" ? 0 : v.length - 3;
  return [v[i + FWD], v[i + SIDE]] as const;
}

/** Pins the Hips' horizontal position to its first frame (removes travel). */
function stripHorizontal(clip: THREE.AnimationClip) {
  const v = hipsTrack(clip).values;
  const [f0, s0] = [v[FWD], v[SIDE]];
  for (let i = 0; i < v.length; i += 3) {
    v[i + FWD] = f0;
    v[i + SIDE] = s0;
  }
}

/** Caps the Hips height at the first frame's (standing) height: keeps crouches, drops the upward throw. */
function clampRise(clip: THREE.AnimationClip) {
  const v = hipsTrack(clip).values;
  // UP holds -height, so "higher" is more negative.
  const standing = v[UP];
  for (let i = 0; i < v.length; i += 3) v[i + UP] = Math.max(v[i + UP], standing);
}

/** Samples the Hips forward travel (metres from frame 0) before it is stripped. */
function forwardCurve(clip: THREE.AnimationClip, metresPerUnit: number): RootCurve {
  const track = hipsTrack(clip);
  const times = Float32Array.from(track.times);
  const fwd = new Float32Array(times.length);
  for (let i = 0; i < times.length; i++) fwd[i] = (track.values[i * 3 + FWD] - track.values[FWD]) * metresPerUnit;
  return { times, fwd };
}

export type RootCurve = { times: Float32Array; fwd: Float32Array };

/** Forward travel at time t (metres), linearly interpolated. */
export function sampleCurve(curve: RootCurve, t: number) {
  const { times, fwd } = curve;
  if (t <= times[0]) return fwd[0];
  const last = times.length - 1;
  if (t >= times[last]) return fwd[last];
  let i = 1;
  while (times[i] < t) i++;
  const a = (t - times[i - 1]) / (times[i] - times[i - 1]);
  return fwd[i - 1] + (fwd[i] - fwd[i - 1]) * a;
}

/**
 * `climb_ladder` was authored facing -X (backwards), 0.26 m to the side, with the climb's
 * 0.22 m-per-loop rise baked into the Hips. Turn it 180° about up, centre it on the root,
 * put the lowest foot at the root, and remove the rise (the capsule supplies it) so the loop
 * is seamless. Returns the rise speed (m/s at timeScale 1) so callers can match it.
 */
function normalizeClimb(clip: THREE.AnimationClip, metresPerUnit: number, footBelowHips: number, hipsForward: number) {
  const pos = hipsTrack(clip);
  const rot = clip.tracks.find((t) => t.name === "mixamorigHips.quaternion");
  if (!rot) throw new Error("climb_ladder: no Hips rotation track");

  // 180° about armature-local Z (which is world up, see axis note above).
  const flip = new THREE.Quaternion(0, 0, 1, 0);
  const q = new THREE.Quaternion();
  const r = rot.values;
  for (let i = 0; i < r.length; i += 4) {
    q.set(r[i], r[i + 1], r[i + 2], r[i + 3]).premultiply(flip);
    r[i] = q.x;
    r[i + 1] = q.y;
    r[i + 2] = q.z;
    r[i + 3] = q.w;
  }

  const v = pos.values;
  const times = pos.times;
  const T = times[times.length - 1];
  const n = v.length;
  for (let i = 0; i < n; i += 3) {
    v[i + FWD] = -v[i + FWD];
    v[i + SIDE] = -v[i + SIDE];
  }
  const drift = [v[n - 3] - v[0], v[n - 2] - v[1], v[n - 1] - v[2]];
  const riseSpeed = (-drift[2] * metresPerUnit) / T;
  for (let k = 0, i = 0; i < n; i += 3, k++) {
    const a = times[k] / T;
    v[i] -= drift[0] * a;
    v[i + 1] -= drift[1] * a;
    v[i + 2] -= drift[2] * a;
  }
  const target = [hipsForward / metresPerUnit, 0, -footBelowHips / metresPerUnit];
  const shift = [target[0] - v[0], target[1] - v[1], target[2] - v[2]];
  for (let i = 0; i < n; i += 3) {
    v[i] += shift[0];
    v[i + 1] += shift[1];
    v[i + 2] += shift[2];
  }
  return riseSpeed;
}

/**
 * The top of a ladder: how Hue's root moves while `climb_top` plays, in metres from where it starts (the lowest foot on the rung).
 * `fwd` is along the exit direction, `up` is the rise; both are the clip's own Hips path (so hands and feet stay put on the rungs
 * and the deck) with the clip's standing-height difference taken out so the feet end exactly on the deck.
 */
export type TopOutCurve = { times: Float32Array; fwd: Float32Array; up: Float32Array; duration: number };

/**
 * `climb_top` came out of the converter facing +Z, a quarter turn from the other clips (+X): turn it 90° about up. Then move the
 * Hips' path out of the track and into `TopOutCurve`, leaving the Hips where they sit relative to the root at the start.
 */
function prepareTopOut(clip: THREE.AnimationClip, metresPerUnit: number): TopOutCurve {
  const rot = clip.tracks.find((t) => t.name === "mixamorigHips.quaternion");
  if (!rot) throw new Error("climb_top: no Hips rotation track");
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), Math.PI / 2);
  const q = new THREE.Quaternion();
  const r = rot.values;
  for (let i = 0; i < r.length; i += 4) {
    q.set(r[i], r[i + 1], r[i + 2], r[i + 3]).premultiply(turn);
    r[i] = q.x;
    r[i + 1] = q.y;
    r[i + 2] = q.z;
    r[i + 3] = q.w;
  }
  const pos = hipsTrack(clip);
  const v = pos.values;
  const p = new THREE.Vector3();
  for (let i = 0; i < v.length; i += 3) {
    p.set(v[i], v[i + 1], v[i + 2]).applyQuaternion(turn);
    v[i] = p.x;
    v[i + 1] = p.y;
    v[i + 2] = p.z;
  }
  const times = pos.times;
  const end = Math.min(CLIMB.topOutEnd, times[times.length - 1]);
  const n = times.filter((t) => t <= end).length;
  const k = HUE.visualScale;
  const f0 = CLIMB.topOutFootBelowHips[0] * k;
  const f1 = CLIMB.topOutFootBelowHips[1] * k;
  const rise = -(v[(n - 1) * 3 + UP] - v[UP]) * metresPerUnit;
  const fwd = new Float32Array(n);
  const up = new Float32Array(n);
  const fwd0 = v[FWD];
  const up0 = v[UP];
  for (let k = 0; k < v.length / 3; k++) {
    const i = k * 3;
    const riseK = -(v[i + UP] - up0) * metresPerUnit;
    const prog = rise > 0 ? Math.min(1, riseK / rise) : 0;
    if (k < n) {
      fwd[k] = (v[i + FWD] - fwd0) * metresPerUnit;
      up[k] = riseK - (f1 - f0) * prog; // the root ends on the deck: the hips-to-foot difference is carried by the Hips instead
    }
    // The Hips keep their start offset above the root (plus that same difference as the clip goes on), and no path.
    v[i + FWD] = (-0.02 * k) / metresPerUnit;
    v[i + SIDE] = 0;
    v[i + UP] = -(f0 + (f1 - f0) * prog) / metresPerUnit;
  }
  return { times: Float32Array.from(times.slice(0, n)), fwd, up, duration: times[n - 1] };
}

/** Moves every frame of the Hips horizontally by (df, ds) track units. */
function shiftHorizontal(clip: THREE.AnimationClip, df: number, ds: number) {
  const v = hipsTrack(clip).values;
  for (let i = 0; i < v.length; i += 3) {
    v[i + FWD] += df;
    v[i + SIDE] += ds;
  }
}

export type PreparedClips = {
  clips: Record<ClipName, THREE.AnimationClip>;
  /**
   * Where the root must sit while seated, relative to SPAWN_Hue_chair, in Hue's local
   * frame (metres; x = forward, z = sideways). sit_to_stand keeps its in-clip pelvis
   * motion (feet stay planted), so the root never moves during the rise.
   */
  seatedRootOffset: THREE.Vector3;
  /** Forward travel removed from `fall_roll`; the capsule follows it during the roll. */
  rollCurve: RootCurve;
  /** How fast `climb_ladder` rises at timeScale 1 (m/s), before its rise was removed. */
  climbRiseSpeed: number;
  /** How the root moves over the top of a ladder while `climb_top` plays. */
  topOut: TopOutCurve;
};

/**
 * Clones and conditions the raw clips.
 *
 * `sit`, `sit_to_stand` and `idle` come from different Mixamo takes: the Hips jump ~5.6 cm
 * between the end of `sit` and the start of `sit_to_stand`, and `sit_to_stand` ends ~11 cm
 * ahead of `idle`. We shift `sit_to_stand` so its last frame matches `idle`, then shift `sit`
 * so it matches the start of `sit_to_stand`, and offset the seated root by the same amount,
 * so the seated pose is exactly where Blender placed it and both crossfades are seamless.
 */
export function prepareClips(
  raw: Record<ClipName, THREE.AnimationClip>,
  metresPerUnit: number,
): PreparedClips {
  const clips = {} as Record<ClipName, THREE.AnimationClip>;
  for (const name of Object.keys(raw) as ClipName[]) {
    const clip = raw[name].clone();
    clip.name = name;
    clips[name] = clip;
  }

  const idle0 = frame(clips.idle, "first");
  const stsEnd = frame(clips.sit_to_stand, "last");
  const stsShift = [idle0[0] - stsEnd[0], idle0[1] - stsEnd[1]] as const;
  shiftHorizontal(clips.sit_to_stand, ...stsShift);

  const sts0 = frame(clips.sit_to_stand, "first");
  const sit0 = frame(clips.sit, "first");
  stripHorizontal(clips.sit);
  const sitShift = [sts0[0] - sit0[0], sts0[1] - sit0[1]] as const;
  shiftHorizontal(clips.sit, ...sitShift);

  const rollCurve = forwardCurve(clips.fall_roll, metresPerUnit);

  // Locomotion loops and the rest: horizontal travel is driven by the capsule.
  // Measured with scripts/clip-limbs.mjs: at frame 0 the lowest foot is 0.166 m below the Hips,
  // and the Hips hang ~0.085 m behind the hands/feet. Hips 0.02 m behind the root puts the
  // hands and feet at the capsule's front (radius 0.06), i.e. on the ledge face or the rungs.
  const climbRiseSpeed = normalizeClimb(clips.climb_ladder, metresPerUnit, 0.166 * HUE.visualScale, -0.02 * HUE.visualScale);

  const topOut = prepareTopOut(clips.climb_top, metresPerUnit);

  for (const name of ["idle", "walk", "run", "jump_down", "jump_down_2", "fall_roll"] as const) {
    stripHorizontal(clips[name]);
  }
  // Height comes from physics; keep the crouches (real knee bends on the ground).
  stripHorizontal(clips.jump);
  clampRise(clips.jump);

  return {
    clips,
    seatedRootOffset: new THREE.Vector3(-sitShift[0] * metresPerUnit, 0, -sitShift[1] * metresPerUnit),
    rollCurve,
    climbRiseSpeed,
    topOut,
  };
}
