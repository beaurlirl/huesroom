// Tunables from CURSOR_GAME_DEV_BUILD_PROMPT.md. Units: metres, seconds.

/**
 * The game may be served under a sub-path of hue.onl (e.g. /huesroom). Set NEXT_PUBLIC_BASE_PATH
 * at build time (next.config.ts uses it as `basePath`) and every asset URL follows.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const asset = (path: string) => `${BASE_PATH}${path}`;

/** The room model belongs to the level (src/levels.ts). */
export const ASSETS = {
  hue: asset("/hue/hue.glb"),
  draco: asset("/draco/"),
  anim: (name: ClipName) => asset(`/hue/anim/${name}.glb`),
};

export const FX_TEXTURES = [
  "/fx/sparkle.png",
  "/fx/smoke_puff_0.png",
  "/fx/smoke_puff_1.png",
  "/fx/smoke_puff_2.png",
  "/fx/smoke_puff_3.png",
].map(asset);

export const CLIP_NAMES = [
  "idle",
  "walk",
  "run",
  "jump",
  "jump_down",
  "jump_down_2",
  "fall_roll",
  "climb_ladder",
  "climb_top",
  "sit",
  "sit_to_stand",
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

export const HUE = {
  height: 0.457,
  /**
   * How big he is drawn, 1 = the size the level geometry was built around (0.457 m). Below 1 he looks smaller in the world; the capsule, speeds, jumps and
   * every route stay exactly as they are. Animation distances measured on the full-size model (hips to foot on the ladder) scale with it.
   */
  visualScale: 0.85,
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
  walkSpeed: 0.55, // user requests: 2x the prompt's 0.25, then "slightly faster"
  runSpeed: 0.8,
  accelTime: 0.12,
  turnRate: 12,
  gravity: 16,
  /**
   * Jumps (and beanbag bounces) play slower than the prompt's: same 0.6 m apex and reach, at
   * ~0.57x speed (user: "twice as slow", then "slightly faster"). Time scale k = 0.575 →
   * gravity 16·k² ≈ 5.3, take-off 4.4·k ≈ 2.53 m/s, air speed 1.2·k ≈ 0.69 m/s. Walking off a
   * ledge still falls with normal gravity.
   */
  jumpGravity: 5.3,
  jumpSpeed: 2.53,
  airSpeed: 0.69, // scaled with the slower jump: same arc and reach
  airControl: 0.8,
  coyoteTime: 0.1,
  jumpBuffer: 0.1,
  shortHopCut: 0.45,
  maxFallSpeed: 8,
  /** Airborne this long (s) before switching to the air pose, so steps don't flicker. */
  airPoseDelay: 0.08,
};

export const FLAGS = {
  /** Second jump at 70% take-off speed, once per air time. Off by design. */
  DOUBLE_JUMP: false,
  /**
   * Ladder controls. false (the prompt): push *toward* the ladder to climb up. The ladder faces
   * the camera, so that's S / joystick-down. true: W / joystick-up always climbs up.
   */
  LADDER_SCREEN_UP: false,
  /** Portrait screens: widen the vertical FOV so at least ~55° shows side to side (capped at 70°). */
  PORTRAIT_FOV_BOOST: false,
};

/** Climbing, ladder and trampoline (prompt 1.5 / 2.6). */
export const CLIMB = {
  minRise: 0.1,
  maxRise: 0.55,
  headroom: 0.47,
  probeAhead: 0.1,
  pushTime: 0.15,
  riseSpeed: 0.28,
  /** Hands above the feet at the top of the climb loop (measured 0.27–0.33 m). The climb
   *  stops once the hands reach the lip; a mantle covers the rest. */
  handReach: 0.3,
  /**
   * Hop from hands-on-the-lip up onto the ledge (s): the rise for a full `handReach`, shorter
   * (down to `mantleTimeMin`) for lower ledges. It leaves at the climb's rise speed and comes to
   * rest at the lip, so the climb loop flows into it without a lurch.
   */
  mantleTime: 0.35,
  mantleTimeMin: 0.22,
  overDistance: 0.1,
  overPastLip: 0.05,
  /** Slide across the lip. It starts `overlap` s before the rise ends, so rise and slide are one arc. */
  overTime: 0.2,
  overlap: 0.06,
  ladderSpeed: 0.22,
  /**
   * Getting over the top of a ladder plays `climb_top` (Mixamo "Climbing To Top") instead of sliding onto the deck. Hue's root follows the
   * clip's own hip path, so hands and feet stay on the rungs and then the deck. It starts when his feet are `topOutRise` below the deck
   * (the clip's rise) and ends on it. `topOutSpeed` plays it faster than the 3.3 s original; `topOutEnd` is where the clip is cut (s).
   * `topOutFootBelowHips` is the lowest foot's distance under the Hips at the clip's start and end (measured with scripts/clip-limbs.mjs).
   */
  topOutSpeed: 1.8,
  topOutEnd: 3.3,
  topOutFootBelowHips: [0.159, 0.185] as const,
  /** How far behind the root (away from the wall) the Hips sit during `climb_top`, at full size (m): the body's distance from the rungs. Constant for the whole clip. */
  topOutHipsBack: 0.02,
  ladderExitMargin: 0.08,
  ladderExitTime: 0.4,
  ladderBottomStep: 0.1,
  doubleJumpScale: 0.7,
};

/** Landings (prompt 1.5 / 2.6). */
export const LANDING = {
  hopMin: 0.2,
  rollMin: 0.9,
  hopLock: 0.4,
  rollLock: 0.5,
  /**
   * Holding a direction as he lands: a drop up to `stepMax` is just a little step (no lock, `stepCarry` of his speed kept) and he walks
   * straight on; a bigger hop only holds the controls `hopLockMoving` s and keeps `hopCarry` of his speed, instead of stopping dead for `hopLock`.
   */
  stepMax: 0.5,
  stepCarry: 0.85,
  hopLockMoving: 0.15,
  hopCarry: 0.6,
};

/** Hand-picked moments inside the clips (seconds), from scripts/clip-timeline.mjs. */
export const CLIP_TIMES = {
  walkSpeedAtScale1: 0.24 * HUE.visualScale, // walk clip travels 0.39 m per 1.63 s loop at full size
  /** The jump clip's air section plays at this speed (0.6 before jumps were slowed 2x). */
  jumpClipScale: 0.69,
  runTimeScale: 1.3 / HUE.visualScale,
  jumpTakeoff: 0.55, // end of the crouch
  jumpAirHold: 0.88, // tucked, mid-air
  jumpLand: 1.05,
  jumpDownLand: 1.55, // feet touch down
  jumpDownEnd: 2.45,
  jumpDownTimeScale: 1.4,
  fallRollStart: 0.08,
};

/** Coins (prompt 1.8 / 2.7). */
export const COINS = {
  sensorRadius: 0.08,
  spinPeriod: 2.5,
  bob: 0.015,
  bobPeriod: 1.8,
  popTime: 0.2,
  envMapIntensity: 1.1,
  /** Gold (linear RGB, close to measured gold reflectance), slightly satin so it reads rich. */
  goldLinear: [1.0, 0.46, 0.07] as [number, number, number],
  roughness: 0.16,
  emissiveLinear: [0.05, 0.03, 0.005] as [number, number, number],
  glintColor: "#fff1c9",
  smokeColor: "#e6d7b4",
  glintsPerCoin: 3,
  glintDur: [0.25, 0.4] as const,
  glintWait: [0.3, 1.2] as const,
  glintSize: [0.03, 0.06] as const,
  /** Sparkles render above 1.0 so the bloom pass picks them up. */
  glintBoost: 6,
  smokePerCoin: 6,
  smokePerCoinMobile: 3,
  burstPuffs: 6,
  smokeOpacity: [0.15, 0.35] as const,
  smokeSize: [0.1, 0.18] as const,
  smokeBehind: 0.04,
};

/** Kickable books (prompt 1.7). */
export const BOOKS = {
  walkImpulse: 0.02, // N·s
  runImpulse: 0.06,
  runLift: 0.15,
  maxSpeed: 2.5,
  /** Min seconds between impulses on the same book (0 = every contact frame, as the prompt says). */
  cooldown: 0,
  thudSpeed: 1,
};

/** Pushable spray cans, cut out of ROOM_static at load (user request). */
export const CANS = {
  massKg: 0.3,
  friction: 0.5,
  restitution: 0.15,
  /** Materials that make up a can (body, nozzle, cap); triangles inside a can's COL box. */
  materials: ["Spray can | gloss black", "Spray can | red", "Spray can | blue", "Brushed aluminum", "Coin gold"],
  /** Floor hits play the thud higher, like a metal clink. */
  clinkPitch: 1.7,
};

export const BLOOM = { threshold: 2.2, intensity: 0.8 };

/**
 * Colour grade for the street (fx/grade.ts). The street's pale, hazy palette read about 45% less saturated than the room (mean saturation
 * 0.22 against 0.40 in matching frames), so it gets a lift. The numbers mean what they do in the postprocessing library's HueSaturation
 * and BrightnessContrast effects (0 = off, 1 = the most); the phone path applies the same formulas inside the materials' shaders.
 */
export const GRADE = { saturation: 0.28, contrast: 0.05, brightness: -0.02 };

/** Street shimmer made steadier (see fx/steady.ts): how much blurrier than the exact mip level colour maps are sampled (mip levels). 0 = off. */
export const STEADY = { mipBias: 0.5 };

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
  /** Two-sided streets: seconds for the camera to swing to the other side, and the dead band (m) around the centre line. */
  flipTime: 0.9,
  flipDeadband: 0.12,
  /** While climbing a ledge the camera follows this much tighter (× smoothY / smoothLook), so the hop up never outruns it. */
  climbSmoothScale: 0.45,
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
  /** Beanbag corner zone (feet x > minX and z < maxZ): camera moves to the top-left. */
  cornerMinX: 0.25,
  cornerMaxZ: -0.45,
  /** Camera x = -(Hue x) × this, i.e. mirrored to the left side of the open wall. */
  cornerMirror: 1,
  cornerCamY: 2.1,
  cornerBlend: 0.6,
  /** Ladder zone (right-wall shelf front, ladder, door shelf): camera rises to ladderCamY. */
  ladderMinX: 0.7,
  ladderMinZ: -0.3,
  ladderMinY: 1.3,
  /** Just under the 2.6 m ceiling, so it sees over the door shelf. */
  ladderCamY: 2.56,
  /** Portrait screens: the most the camera turns to face Hue in the ladder zone (≈ 30°). */
  ladderPortraitYaw: (30 * Math.PI) / 180,
  /** Phones held landscape: a gentler limit (desktop keeps the full corner view). */
  ladderPhoneYaw: (40 * Math.PI) / 180,
  portraitMinHFov: 55,
  portraitMaxVFov: 70,
};

/**
 * Opening (user request): on white, the title fades in, then the credit line; hold; then the
 * whole card fades out to Hue on the chair, and the begin prompt appears. Restarts skip the
 * card and just fade from white.
 */
export const INTRO = {
  titleIn: 1.1,
  creditDelay: 0.9,
  creditIn: 1.0,
  /** Title and credit dissolving into the glass as it clears. */
  titleOut: 0.9,
  /** Seconds from the start of the intro until the card begins to fade out. */
  cardHold: 3.8,
  /** White glass clearing to the room. */
  fadeFromWhite: 1.8,
  credit: "A game developed by Gest in Lower Manhattan",
};

/** The same card for players who have started the game on this device before: it shows the title and gets out of the way (seen.ts). */
export const INTRO_QUICK = {
  titleIn: 0.7,
  creditDelay: 0.3,
  creditIn: 0.6,
  titleOut: 0.5,
  cardHold: 1.4,
  fadeFromWhite: 0.9,
  credit: INTRO.credit,
};

/** Win: title on the fogged glass, then the results (seconds). */
export const OUTRO = {
  /** How long "hue leaves home" holds before the results settle in. */
  titleHold: 3.0,
  /** Title dissolving before the results. */
  titleOut: 0.6,
  /** Gap between each results row condensing in. */
  stagger: 0.18,
};
