import { assetV } from "./config";
import type { Paint } from "./paint";
import type { CAMERA, SKATE } from "./config";
import type { Par } from "./economy";

/**
 * How a level plays. `run`: timed, with a best time (and, later, medals). `explore`: a relaxed
 * walk-through with no clock, for levels that are more exhibit than obstacle course. `skate`: Hue rides a skateboard along the
 * level's lane (see `skate` below); timed like `run`, but it ends at a finish line and its coins are optional.
 */
export type LevelMode = "run" | "explore" | "skate";

/** A skateboard level's settings (see "Skate levels" in the README for what its model needs). */
export type SkateDef = {
  /** Node in the model where the run ends: the first time his feet pass its position along the lane, he wins. */
  finish: string;
  /** Node in the model whose `route` user data is the path he rides: a list of [x, y, z] points (the model's world axes, y up) in riding order. Without one the lane is straight from the spawn, the way it faces. Default "SKATE_ROUTE". */
  route?: string;
  /** Any of the SKATE.cam numbers, for a level that wants the camera nearer, higher or wider. */
  camera?: Partial<typeof SKATE.cam>;
};

/** Per-level camera settings: any of the CAMERA numbers, plus the street-only options below. */
export type LevelCamera = Partial<typeof CAMERA> & {
  /** Two camera planes, one on each side of the street; the camera swings to the other side when Hue crosses the centre line (z = 0). */
  twoSided?: boolean;
  /** Camera x limits when the level isn't symmetric (default: +-xClamp). */
  xMin?: number;
  xMax?: number;
  /** Start low and rise: how far below the normal height the camera begins (m), and how far Hue walks before it has risen. */
  introDrop?: number;
  introDist?: number;
  /** Seconds a shot takes to come in and go out (default `cornerBlend`). */
  shotBlend?: number;
  /** The camera never leaves this box (the shop's walls: x and z limits), except in the opening, which stands outside the door. */
  confine?: { x0: number; x1: number; z0: number; z1: number };
  /**
   * Sight map: the camera checks it can see all of Hue against what is solid in the room (rasterised from the model once it has loaded; needs `confine`). Where the shots and zones
   * below put it somewhere it cannot, it moves to the nearest spot that can: closer to him, then higher, then round to the side. `release`: seconds the shot's own camera must see
   * him again before the camera goes back to it; `cell`: the map's cell size (m); `lookLag`: the most (m) the point the camera looks at may trail his chest; `open`: how much farther back (a fraction of its distance) the camera may stand where it sees him and the way back is clear, to show the size of the place.
   */
  sight?: { cell?: number; release?: number; lookLag?: number; open?: number };
  /** Keep Hue in view: if a tall fixture (a collider with `view_block` in its data) would hide him from where the camera is, the camera rises or slides until it can see him. */
  keepInView?: boolean;
  /** A last smoothing over the camera's position (seconds), so cutting from one shot to another never pops. Off when missing. */
  finalSmooth?: number;
  /**
   * Fixed shots: while Hue's feet are inside the zone (x0..x1, z0..z1) the camera stands at `pos` and keeps him in view (a long look down an aisle,
   * say), then eases back to the normal follow shot when he leaves. The controls turn with the camera, but a direction held through the cut keeps
   * its meaning until it is let go. `cutaway` names a piece of the model (a node with `cutaway` in its data) that is hidden while the shot is on,
   * for a view across something that would be in the way (the middle shelf). With `followX`, pos[0] is an offset from Hue's x instead of a fixed place, so the camera trails him along an aisle
   * (a chase shot). A shot flagged `once` is the opening: the run starts in it (if Hue starts inside its zone), and it is gone for
   * good as soon as he walks out.
   */
  shots?: { x0: number; x1: number; z0: number; z1: number; pos: [number, number, number]; /** A chase shot: the camera stays `dist` metres behind Hue, whichever way he is heading (it turns with him around corners), `height` above his feet. `pos` is then only the shot's resting place. */ chase?: { dist: number; height: number; /** Extra height (m) while the camera has to swing right round to get behind him again (he turned back): it rises up and over, then comes down. */ arc?: number; /** Keeps the camera's spot inside this box (any side left out is free): it stays in an aisle instead of riding up over a shelf. */ box?: { x0?: number; x1?: number; z0?: number; z1?: number }; /** Extra height that fades in as Hue's x goes from `from` to `to` (the front end of the shop: the camera is higher there). */ lift?: { from: number; to: number; extra: number } }; /** After Hue has walked `dist` (m) from where the run began, `pos` and `fov` ease to `pos2` and `fov2` (the wide opening becomes a close follow). */ pos2?: [number, number, number]; fov2?: number; dist?: number; /** Only while Hue's feet are below this height (climbing out of the zone ends the shot). */ y1?: number; once?: boolean; fov?: number; followX?: boolean; cutaway?: string }[];
  /** Zones where the camera has to be at least this high (feet inside x0..x1, z0..z1): to look over low equipment that stands between it and Hue. */
  rise?: { x0: number; x1: number; z0: number; z1: number; y: number }[];
};

/**
 * One level. The room model is the level: its colliders, coins and spawn point are nodes in the
 * glTF (see "Level format" in the README), so a new level is a new model plus an entry below.
 */
export type LevelDef = {
  id: string;
  /** "location 01" on the win card and the share caption. */
  number: number;
  name: string;
  mode: LevelMode;
  /** The room model's URL. */
  room: string;
  /** Node in the room model where Hue starts (its `facing_xy` user data gives the facing). */
  spawn: string;
  /** "chair": he sits at the spawn and stands up when play begins. "stand": he is already on his feet there. */
  start: "chair" | "stand";
  /** The line that ends the level (win panel and share card). */
  winLine: string;
  /** "room": the fixed room lights. "street": the sun follows Hue along the street, on the camera's side. "shop": the room's indoor lights, following Hue through a long interior. */
  lighting: "room" | "street" | "shop";
  /**
   * A roof over the level: a flat ceiling (with light panels) at height `y` over the box x0..x1, z0..z1, drawn from below only, so a camera above it still looks in. It has no
   * collider, so `y` must be higher than he can ever reach (the highest standable surface plus a jump, and his height).
   */
  ceiling?: { y: number; x0: number; x1: number; z0: number; z1: number };
  /** Colour for materials the model left plain: material name -> colour, roughness, metalness or glow (src/paint.ts). Costs no triangles or textures. */
  paint?: Record<string, Paint>;
  /**
   * His drawn body stands on the drawn surface under his feet: where the invisible box he walks on is a hand below a row of cartons, or above the gap between them, his body is eased up
   * (or a little down) to what you can see, so he never sinks into a top or hovers over it. The physics, and so every route, is untouched (see src/surface.ts).
   */
  snapFeet?: boolean;
  /** Hue's silhouette shows through whatever stands in front of him (a soft blue outline), so he is never lost behind a shelf or a counter. */
  xray?: boolean;
  camera?: LevelCamera;
  /** Only for mode "skate". */
  skate?: SkateDef;
  /** Speed bonus for `run` levels (see economy.ts). Times are seconds; tune them against real runs. */
  par?: Par;
  /** Nodes flagged `haze` in the model fade to white beyond these x limits, over `span` metres (the blurry ends of a street). */
  haze?: { xMin: number; xMax: number; span: number };
  /** false = not released yet: reachable only with ?level=<id>, never offered as the next level. */
  live: boolean;
  /** Attribution shown (as plain text, no link) on the win screen. */
  credit?: string;
};

/** In release order. The first entry is the default and the fallback for an unknown `?level=`. */
export const LEVELS: readonly LevelDef[] = [
  {
    id: "home",
    number: 1,
    name: "home",
    mode: "run",
    room: assetV("/room/room.glb"),
    spawn: "SPAWN_Hue_chair",
    start: "chair",
    winLine: "hue made it outside",
    lighting: "room",
    par: { fast: 25, slow: 90, bonusMax: 20 },
    live: true,
  },
  {
    id: "street",
    number: 2,
    name: "ludlow st",
    mode: "run",
    room: assetV("/levels/street/room.glb"),
    spawn: "SPAWN_Hue_start",
    start: "stand",
    winLine: "hue made it to the deli",
    lighting: "street",
    camera: {
      twoSided: true,
      xClamp: 16,
      xMin: -14.2,
      xMax: 7.7,
      yMax: 5.6,
      roomDepth: 4.0,
      cornerMinX: 999,
      ladderMinX: 999,
      introDrop: 0.9,
      introDist: 0.9,
    },
    par: { fast: 60, slow: 180, bonusMax: 40 },
    haze: { xMin: -15, xMax: 8.5, span: 5.5 },
    credit: "street layout from map data © OpenStreetMap contributors",
    live: true,
  },
  {
    id: "deli",
    number: 3,
    name: "the deli",
    mode: "run",
    room: assetV("/levels/deli/room.glb"),
    spawn: "SPAWN_Hue_start",
    start: "stand",
    winLine: "hue got what he came for",
    lighting: "shop",
    snapFeet: true,
    // The palette from the owner's entrance photo: the plaster, tile, counter fronts and countertop came out of the model white.
    paint: {
      "01 / Plaster • warm gray": { color: "#f1e6c7" },
      "02 / Tile • light gray": { color: "#e8dcbc" },
      "03 / Grout": { color: "#a39a88" },
      "07 / Service-counter zone": { color: "#35604f", roughness: 0.38 },
      "08 / Countertop": { color: "#e6e0d2" },
      "11 / Shelf decks": { color: "#7d9184" },
      "19 / Stock volume proxies": { color: "#c8aa80", roughness: 0.8 },
    },
    // The roof: the highest thing he can stand on is 1.98 m, a jump from it takes his head to 3.04 m, so 3.1 m is a hand above anything he can do.
    ceiling: { y: 3.1, x0: -3.84, x1: 3.7, z0: -2.37, z1: 2.37 },
    camera: {
      // The deli is 7.7 m long and 4.7 m deep (a real deli at 0.65, so Hue is about 2 and a third feet tall in it). The camera follows him
      // loosely along the shop and rises with his depth, to look over the shelves. A narrower lens than the room's keeps Hue big on screen.
      fov: 40,
      fovFar: 34,
      confine: { x0: -3.78, x1: 3.78, z0: -2.7, z1: 2.45 },
      sight: { open: 0.55 },
      keepInView: true,
      shotBlend: 1.1,
      finalSmooth: 0.3,
      xClamp: 3.9,
      xMin: -3.9,
      xMax: 3.9,
      yMin: 0.5,
      // Under the roof (the ceiling above, 3.1 m): the camera is always inside the shop.
      yMax: 2.95,
      roomDepth: 4.75,
      offsetNear: 1.3,
      offsetFar: 2.4,
      smoothX: 0.8,
      smoothY: 0.9,
      smoothLook: 0.5,
      unblockMax: 0.5,
      // The back right corner (the liquor coolers, x > 2.6 on the camera's side of the shop): the camera rises to look over the top shelves, and stays on Hue's side of the room.
      cornerMinX: 999,
      ladderMinX: 2.6,
      ladderMinZ: 0.5,
      ladderMinY: -1,
      ladderCamY: 2.95,
      cornerMirror: -1,
      // The grill line (the staff aisle between the deli case and the hot line): the camera stands at its front end and looks down it as Hue
      // runs along, because from the open side the equipment hides him.
      shots: [
        // The pocket of the ice-cream freezer in the left aisle's side: its end wall faces the aisle, so the aisle camera cannot see in. Here the camera
        // looks at the open door from across the shop, from beside the end of the middle shelf.
        { x0: -2.45, x1: -1.35, z0: -2.5, z1: -1.85, y1: 0.9, pos: [-2.9, 1.2, 2.39] },
        // Round the two ends of the middle shelf (the gaps that join the left aisle to the customer aisle): the camera stays at his head level and follows
        // closely behind him round the corner, in the aisle air, so it never swings up and over the shelf to get to the other side.
        { x0: -3.0, x1: -1.9, z0: -0.72, z1: 0.82, y1: 0.9, pos: [-2.5, 0.8, -1.3], chase: { dist: 1.05, height: 0.6, arc: 0.9, box: { x0: -2.85, x1: -2.1, z0: -1.55, z1: 0.7 } }, fov: 62 },
        { x0: 1.23, x1: 2.55, z0: -0.72, z1: 0.77, y1: 0.9, pos: [1.6, 0.8, -1.3], chase: { dist: 1.05, height: 0.6, arc: 0.9, box: { x0: 1.35, x1: 2.3, z0: -1.55, z1: 0.7 } }, fov: 62 },
        // The left aisle (from the front door to the back wall): the camera trails behind Hue. The run opens high up and wide (about an ultra-wide
        // 0.5x), outside the doorway with him facing the back wall, so how small he is in the shop shows; as he walks it comes in close and low behind
        // him, so the shelves tower over him and how big they are to climb shows. From the open side the tall shelves and register cabinets would
        // hide him in this aisle, so this is the only view of it.
        { x0: -4.6, x1: 3.9, z0: -2.35, z1: -0.72, y1: 0.9, pos: [-2.4, 1.6, -1.25], fov: 78, pos2: [-1.3, 0.95, -1.25], fov2: 62, dist: 2.4, followX: true },
        // The open floor at the back, behind the liquor cooler (from the open side the cooler hides it): the same trailing camera, carried on.
        { x0: 1.9, x1: 3.9, z0: -0.72, z1: 0.22, y1: 0.9, pos: [-2.4, 1.6, -1.25], fov: 78, pos2: [-1.3, 0.95, -1.25], fov2: 62, dist: 2.4, followX: true },
        // The grill line (the staff aisle between the deli case and the hot line), and the corner at its far end where it turns through the gap beside the
        // rear chip shelf: from the open side the equipment and shelves hide him, so the camera chases him closely from behind, turning with him
        // around the corner.
        { x0: -3.9, x1: 3.9, z0: 1.4, z1: 2.45, y1: 1.0, pos: [-3.7, 0.8, 1.7], chase: { dist: 1.25, height: 0.8, arc: 0.9, lift: { from: -1.9, to: -3.4, extra: 0.9 } }, fov: 60 },
        // The top of the lane in front of the register, where it meets the front end of the grill line (the front-right corner of the map): the same
        // chase, high, so it looks over the counter and the donut display instead of dropping to the steep wall camera.
        { x0: -3.9, x1: -3.3, z0: 0.4, z1: 1.4, y1: 1.0, pos: [-3.6, 1.5, 0.2], chase: { dist: 1.3, height: 1.4, arc: 0.8 }, fov: 60 },
        // (The corner is the one angle at his head level: close behind him, low, in the narrow gap.)
        { x0: 1.55, x1: 2.55, z0: 0.77, z1: 1.4, y1: 1.0, pos: [1.95, 0.5, 1.4], chase: { dist: 1.15, height: 0.42, arc: 1.5, box: { x0: 2.12, x1: 2.3 } }, fov: 62 },
        // The customer side of the deli case (the aisle between it and the middle shelf): the camera stands at the back end of the aisle, with the
        // liquor cooler behind it, and looks down the aisle toward the front, the case on one side and the middle shelf on the other, so the cold cuts and
        // cheese (and the dome opening) show as Hue walks along them.
        { x0: -3.0, x1: 1.4, z0: 0.02, z1: 0.82, y1: 0.5, pos: [1.95, 1.05, 0.45], fov: 62 },
      ],
      // The lane in front of the register runs toward the camera, and the counter hides it: look down into it from above.
      rise: [
        // The lane in front of the register runs toward the camera, and the counter hides it: look down into it from above (not so high that he is
        // seen from straight above where the lane meets the camera's wall).
        { x0: -3.9, x1: -3.4, z0: -1.0, z1: 1.4, y: 1.7 },
      ],
    },
    par: { fast: 120, slow: 360, bonusMax: 40 },
    live: true,
  },
  {
    // The skateboard test yard: a flat lane with obstacles, a kicker, rails and coins over all of them, ridden from behind (scripts/build_skate_yard.py). Not offered to players.
    id: "skate-yard",
    number: 4,
    name: "skate yard",
    mode: "skate",
    room: assetV("/levels/skate-yard/room.glb"),
    spawn: "SPAWN_Hue_start",
    start: "stand",
    winLine: "hue rolled the whole way",
    lighting: "street",
    skate: { finish: "SKATE_FINISH" },
    par: { fast: 9, slow: 40, bonusMax: 10 },
    live: false,
  },
];

/** A coin node in a room model. The level's coin total is however many of these it has. */
export const COIN_NODE = /^COIN_\d+$/;

export function levelById(id: string | null | undefined): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

/** The level offered after this one: the next released entry in release order, or null at the end of the list. */
export function nextLevel(id: string): LevelDef | null {
  const i = LEVELS.findIndex((l) => l.id === id);
  return LEVELS.slice(i + 1).find((l) => l.live) ?? null;
}

/**
 * Where a level's best time is stored. The first level keeps the original key so existing players keep their time;
 * every other level gets its own, so adding a level to LEVELS needs no other storage change.
 */
export function bestKey(id: string): string {
  return id === LEVELS[0].id ? "huesroom.best" : `huesroom.best.${id}`;
}

/** Where the player's coins, bonuses and items are stored on this device (see ledger.ts). */
export const LEDGER_KEY = "huesroom.ledger";
