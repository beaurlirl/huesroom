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

/** Character controller (prompt 2.5). */
export const MOVE = {
  offset: 0.005,
  autostepMax: 0.1,
  autostepMinWidth: 0.04,
  snapToGround: 0.04,
  maxSlope: (45 * Math.PI) / 180,
  walkSpeed: 0.25,
  runSpeed: 0.8,
  accelTime: 0.12,
  turnRate: 12,
  gravity: 16,
  jumpSpeed: 4.4,
  airSpeed: 1.2,
  airControl: 0.8,
  coyoteTime: 0.1,
  jumpBuffer: 0.1,
  shortHopCut: 0.45,
  maxFallSpeed: 8,
  /** Airborne this long (s) before switching to the air pose, so steps don't flicker. */
  airPoseDelay: 0.08,
};

/** Landings (prompt 1.5 / 2.6). */
export const LANDING = {
  hopMin: 0.2,
  rollMin: 0.9,
  hopLock: 0.4,
  rollLock: 0.5,
};

/** Hand-picked moments inside the clips (seconds), from scripts/clip-timeline.mjs. */
export const CLIP_TIMES = {
  walkSpeedAtScale1: 0.24, // walk clip travels 0.39 m per 1.63 s loop
  runTimeScale: 1.3,
  jumpTakeoff: 0.55, // end of the crouch
  jumpAirHold: 0.88, // tucked, mid-air
  jumpLand: 1.05,
  jumpDownLand: 1.55, // feet touch down
  jumpDownEnd: 2.45,
  jumpDownTimeScale: 1.4,
  fallRollStart: 0.08,
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
  unblockMax: 0.5,
  unblockSmooth: 0.3,
  peekYaw: (25 * Math.PI) / 180,
  peekPitch: (12 * Math.PI) / 180,
  peekPerPixel: 0.004,
  peekReturn: 0.4,
};

export const INTRO = {
  fadeFromWhite: 1.5,
  titleHold: 1.2,
  titleFadeOut: 0.6,
};
