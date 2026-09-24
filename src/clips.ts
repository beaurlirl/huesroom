import * as THREE from "three";
import type { ClipName } from "./config";

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
function stripHorizontal(clip: THREE.AnimationClip, alsoVertical = false) {
  const v = hipsTrack(clip).values;
  const [f0, s0] = [v[FWD], v[SIDE]];
  const u0 = v[UP];
  for (let i = 0; i < v.length; i += 3) {
    v[i + FWD] = f0;
    v[i + SIDE] = s0;
    if (alsoVertical) v[i + UP] = u0;
  }
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

  // Locomotion loops and the rest: horizontal travel is driven by the capsule.
  for (const name of ["idle", "walk", "run", "climb_ladder", "jump_down", "jump_down_2", "fall_roll"] as const) {
    stripHorizontal(clips[name]);
  }
  stripHorizontal(clips.jump, true);

  return {
    clips,
    seatedRootOffset: new THREE.Vector3(-sitShift[0] * metresPerUnit, 0, -sitShift[1] * metresPerUnit),
  };
}
