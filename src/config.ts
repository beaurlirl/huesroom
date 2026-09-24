// Tunables from CURSOR_GAME_DEV_BUILD_PROMPT.md. Units: metres, seconds.

export const ASSETS = {
  room: "/room/room.glb",
  hue: "/hue/hue.glb",
  draco: "/draco/",
  anim: (name: ClipName) => `/hue/anim/${name}.glb`,
};

export const CLIP_NAMES = [
  "idle",
  "walk",
  "run",
  "jump",
  "jump_down",
  "jump_down_2",
  "fall_roll",
  "climb_ladder",
  "sit",
  "sit_to_stand",
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

export const HUE = {
  height: 0.457,
  capsuleRadius: 0.06,
  capsuleHalfHeight: 0.17,
  crossfade: 0.15,
};

export const CAMERA = {
  planeOffset: 0.02, // in front of COL_Boundary south's inner face
  xClamp: 1.15,
  yMin: 0.3,
  yMax: 2.45,
  roomDepth: 3.05,
  offsetNear: 0.35,
  offsetFar: 1.3,
  frontEdge: 0.6,
  frontEdgeLift: 0.4,
  chestHeight: 0.28,
  jumpDeadzone: 0.3,
  smoothX: 0.4,
  smoothY: 0.5,
  smoothLook: 0.25,
  yawClamp: (55 * Math.PI) / 180,
  pitchMin: (-65 * Math.PI) / 180,
  pitchMax: (10 * Math.PI) / 180,
  fov: 50,
  fovFar: 42,
  fovFarDistance: 2.2,
  fovFront: 60,
  near: 0.01,
};

export const INTRO = {
  fadeFromWhite: 1.5,
  titleHold: 1.2,
  titleFadeOut: 0.6,
};
