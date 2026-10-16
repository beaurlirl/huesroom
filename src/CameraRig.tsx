"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, type RapierCollider } from "@react-three/rapier";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CAMERA as BASE_CAMERA, FLAGS } from "./config";
import type { LevelCamera } from "./levels";
import { useIsTouch } from "./Hud";
import { pollGamepad } from "./input/gamepad";
import { colliderMeta, roomColliders } from "./Room";
import { runtime, useGame } from "./store";
import { useLevel } from "./useLevel";

/** The base camera numbers (the peek and unblock helpers use these; the rig itself uses the level's `cam`). */
const C = BASE_CAMERA;

/** Critically damped spring (Unity-style SmoothDamp). Mutates `state.v`. */
function smoothDamp(current: number, target: number, state: { v: number }, smoothTime: number, dt: number) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  return target + (change + temp) * exp;
}

const clamp = THREE.MathUtils.clamp;

/** Offsets tried on the plane (metres, [side, up]) when furniture hides Hue. */
const UNBLOCK_CANDIDATES: [number, number][] = [];
for (let up = 0.1; up <= C.unblockMax + 1e-6; up += 0.1) UNBLOCK_CANDIDATES.push([0, up]);
for (const side of [0.15, 0.3, 0.45]) {
  for (const up of [0, 0.2, 0.4]) {
    UNBLOCK_CANDIDATES.push([side, up], [-side, up]);
  }
}

/** Mouse-drag peek: offsets the follow rotation, springs back on release. */
function usePeek() {
  const gl = useThree((s) => s.gl);
  const peek = useRef({ dragging: false, pointerId: -1, x0: 0, y0: 0, yaw: 0, pitch: 0, vy: { v: 0 }, vp: { v: 0 } });
  useEffect(() => {
    const el = gl.domElement;
    const p = peek.current;
    const down = (e: PointerEvent) => {
      // Mouse: drag anywhere. Touch: drag on the empty right half (the joystick owns the left).
      if (e.pointerType !== "mouse" && e.clientX < window.innerWidth / 2) return;
      if (p.dragging) return;
      p.dragging = true;
      p.pointerId = e.pointerId;
      p.x0 = e.clientX - p.yaw / C.peekPerPixel;
      p.y0 = e.clientY - p.pitch / C.peekPerPixel;
    };
    const move = (e: PointerEvent) => {
      if (!p.dragging || e.pointerId !== p.pointerId) return;
      p.yaw = clamp(-(e.clientX - p.x0) * C.peekPerPixel, -C.peekYaw, C.peekYaw);
      p.pitch = clamp(-(e.clientY - p.y0) * C.peekPerPixel, -C.peekPitch, C.peekPitch);
    };
    const up = (e?: Event) => {
      if (e instanceof PointerEvent && e.pointerId !== p.pointerId) return;
      p.dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
    };
  }, [gl]);
  return peek;
}

/**
 * The camera lives on the open-wall plane (z locked). It slides on X and Y and rotates
 * to keep Hue in view. See prompt section 1.6.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { world, rapier } = useRapier();
  const peek = usePeek();
  const coarse = useIsTouch();
  const level = useLevel();
  const cam = useMemo(() => ({ ...BASE_CAMERA, ...level.camera }) as typeof BASE_CAMERA & LevelCamera, [level]);
  const s = useRef({
    unblock: new THREE.Vector2(),
    cornerW: 0,
    vcw: { v: 0 },
    ladderW: 0,
    vlw: { v: 0 },
    yMaxNow: cam.yMax as number,
    vux: { v: 0 },
    vuy: { v: 0 },
    initialised: false,
    x: 0,
    y: 0,
    vx: { v: 0 },
    vy: { v: 0 },
    look: new THREE.Vector3(),
    vlx: { v: 0 },
    vly: { v: 0 },
    vlz: { v: 0 },
    refY: 0,
    fov: cam.fov,
    vfov: { v: 0 },
    /** Two-sided streets: the side the camera is on, how far through the swing it is, the intro rise (0 low .. 1 risen), and whether the controls keep their old meaning. */
    side: 1 as 1 | -1,
    flip: 0,
    intro: 0,
    latch: false,
    /** The stick angle (runtime.stickAngle) when the latch was set. */
    latchAngle: 0,
    /** A fixed shot (levels.ts `shots`): which one is on, and how far the camera is into it (0 = the normal follow shot, 1 = the shot). */
    shot: null as NonNullable<LevelCamera["shots"]>[number] | null,
    shotW: 0,
    vsw: { v: 0 },
    /** `once` shots that have played (a restart clears them). */
    shotsDone: new Set<object>(),
    /** A chase shot's x: it trails Hue, eased. */
    sx: 0,
    vsx: { v: 0 },
    /** The followX shot `sx` belongs to: a followX camera starts from where the camera is when its shot comes on (not from where it last was). */
    sxShot: null as object | null,
    /** Sight blockers for the keep-in-view guard (colliders flagged `view_block`), and the lift/slide it is applying now. */
    blockers: null as null | { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[],
    gx: 0,
    gy: 0,
    vgx: { v: 0 },
    vgy: { v: 0 },
    /** The camera's smoothed position (levels.ts `finalSmooth`). */
    px: 0,
    py: 0,
    pz: 0,
    vpx: { v: 0 },
    vpy: { v: 0 },
    vpz: { v: 0 },
    pInit: false,
    /** The way Hue is heading (radians, in the xz plane), smoothed: a chase shot trails behind it. */
    heading: 0,
    /** The heading he is turning toward (the last way he really moved). */
    want: 0,
    lastX: 0,
    lastZ: 0,
    /** Solid fixtures a chase camera must clear (footprints and tops), built once from the room's colliders. */
    obstacles: null as null | { x0: number; x1: number; z0: number; z1: number; top: number }[],
    /** A chase shot's smoothed height above his feet (it rises while the camera swings round). */
    ch: 0,
    vch: { v: 0 },
    chInit: false,
    /** The shot's lens right now (its `fov`, easing to `fov2` as Hue walks away from the start). */
    shotFov: 0,
  });

  const targets = (st: typeof s.current) => {
    const feet = runtime.feet;
    // Height deadzone: ignore jump bobs, follow once he lands higher (or drops below).
    if (runtime.grounded || feet.y < st.refY) st.refY = feet.y;
    else if (feet.y - st.refY > cam.jumpDeadzone) st.refY = feet.y - cam.jumpDeadzone;

    const d = clamp(runtime.openWallZ - st.side * feet.z, 0, cam.roomDepth);
    let y = st.refY + THREE.MathUtils.lerp(cam.offsetNear, cam.offsetFar, d / cam.roomDepth);
    if (d < cam.frontEdge) y += cam.frontEdgeLift * (cam.frontEdge - d);
    for (const r of cam.rise ?? []) if (feet.x >= r.x0 && feet.x <= r.x1 && feet.z >= r.z0 && feet.z <= r.z1) y = Math.max(y, r.y);
    y -= (1 - st.intro) * (cam.introDrop ?? 0); // the start shot is low, then rises as Hue walks off
    let x = clamp(feet.x, cam.xMin ?? -cam.xClamp, cam.xMax ?? cam.xClamp);

    // Beanbag corner (back right): following from the right side loses him behind the bag and
    // off the top of the frame when he bounces, so blend to the top-left of the open wall and
    // look down across the room instead (user request).
    const w = st.cornerW;
    if (w > 0.001) {
      x = THREE.MathUtils.lerp(x, clamp(-feet.x * cam.cornerMirror, -cam.xClamp, cam.xClamp), w);
      y = THREE.MathUtils.lerp(y, Math.max(y, cam.cornerCamY), w);
    }
    // Ladder / door shelf: the door shelf sits between the camera and the ladder, so rise
    // almost to the ceiling to look over it (user request).
    const lw = st.ladderW;
    const yMax = THREE.MathUtils.lerp(cam.yMax, cam.ladderCamY, lw);
    if (lw > 0.001) {
      // Also from the top-left, like the beanbag corner (user request). On narrow portrait
      // screens the far corner needs more turn than the yaw clamp allows and Hue left the frame
      // at the top of the ladder, so there the camera only goes far enough left to face him
      // within ladderPortraitYaw.
      let cornerX = clamp(-feet.x * cam.cornerMirror, -cam.xClamp, cam.xClamp);
      const limit = camera.aspect < 1 ? cam.ladderPortraitYaw : coarse ? cam.ladderPhoneYaw : null;
      if (limit !== null) {
        const depth = Math.max(0.05, runtime.openWallZ + cam.planeOffset - feet.z);
        cornerX = Math.max(cornerX, feet.x - depth * Math.tan(limit));
      }
      x = THREE.MathUtils.lerp(x, clamp(cornerX, -cam.xClamp, cam.xClamp), lw);
      y = THREE.MathUtils.lerp(y, Math.max(y, cam.ladderCamY), lw);
    }
    st.yMaxNow = yMax;
    return {
      x,
      y: clamp(y, cam.yMin, yMax),
      look: new THREE.Vector3(feet.x, feet.y + cam.chestHeight, feet.z),
      d,
    };
  };

  useLayoutEffect(() => {
    camera.near = cam.near;
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }, [camera, cam.near, cam.fov]);

  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  // Restart: snap back to the start shot (the white fade hides the jump).
  const runId = useGame((st) => st.runId);
  useEffect(() => {
    s.current.initialised = false;
  }, [runId]);

  const ray = useRef(new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }));
  const inside = useRef(new Set<number>());
  /** Only fixed room geometry blocks the view (not Hue, the books, sensors or invisible rail walls, which are flagged `camera_pass` in the model). */
  const blocks = (c: RapierCollider) =>
    !c.isSensor() && !!c.parent()?.isFixed() && !inside.current.has(c.handle) && !colliderMeta.get(c.handle)?.userData.camera_pass;
  const isClear = (x: number, y: number, z: number, target: THREE.Vector3) => {
    const o = { x, y, z };
    inside.current.clear();
    world.intersectionsWithPoint(o, (c) => {
      inside.current.add(c.handle);
      return true;
    });
    const dx = target.x - x;
    const dy = target.y - y;
    const dz = target.z - z;
    const len = Math.hypot(dx, dy, dz);
    const r = ray.current;
    r.origin = o;
    r.dir = { x: dx / len, y: dy / len, z: dz / len };
    return !world.castRay(r, len - 0.05, true, undefined, undefined, undefined, undefined, blocks);
  };
  const findClearOffset = (x: number, y: number, z: number, target: THREE.Vector3): [number, number] => {
    if (isClear(x, y, z, target)) return [0, 0];
    for (const [side, up] of UNBLOCK_CANDIDATES) {
      const cx = clamp(x + side, -cam.xClamp, cam.xClamp);
      const cy = clamp(y + up, cam.yMin, s.current.yMaxNow);
      if (isClear(cx, cy, z, target)) return [side, up];
    }
    return [0, 0];
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const st = s.current;
    const xmin = cam.xMin ?? -cam.xClamp;
    const xmax = cam.xMax ?? cam.xClamp;

    if (!st.initialised && runtime.hueReady) {
      st.side = cam.twoSided && runtime.feet.z > 0 ? -1 : 1;
      st.flip = st.side > 0 ? 0 : 1;
      st.intro = 0;
      st.latch = false;
      st.refY = runtime.feet.y;
      const t = targets(st);
      st.x = t.x;
      st.y = t.y;
      st.look.copy(t.look);
      for (const v of [st.vx, st.vy, st.vlx, st.vly, st.vlz, st.vux, st.vuy]) v.v = 0;
      st.unblock.set(0, 0);
      // The run may open in a fixed shot (a `once` shot over the start): begin fully in it.
      st.shotsDone.clear();
      st.vsw.v = 0;
      st.pInit = false;
      const s0 =
        cam.shots?.find(
          (sh) =>
            runtime.feet.x >= sh.x0 && runtime.feet.x <= sh.x1 && runtime.feet.z >= sh.z0 && runtime.feet.z <= sh.z1 && runtime.feet.y <= (sh.y1 ?? Infinity),
        ) ?? null;
      st.shot = s0;
      st.shotW = s0 ? 1 : 0;
      st.sx = s0?.followX ? runtime.feet.x + s0.pos[0] : 0;
      st.sxShot = s0?.followX ? s0 : null;
      st.vsx.v = 0;
      st.shotFov = s0?.fov ?? 0;
      st.heading = 0; // the run starts facing +x (down the shop)
      st.want = 0;
      st.chInit = false;
      st.obstacles = null;
      st.blockers = null;
      st.gx = 0;
      st.gy = 0;
      st.lastX = runtime.feet.x;
      st.lastZ = runtime.feet.z;
      if (s0?.fov) st.fov = s0.fov; // the opening starts on its own lens
      st.initialised = true;
    }
    if (!st.initialised) return;

    const f = runtime.feet;
    const inCorner = f.x > cam.cornerMinX && f.z < cam.cornerMaxZ;
    st.cornerW = clamp(smoothDamp(st.cornerW, inCorner ? 1 : 0, st.vcw, cam.cornerBlend, dt), 0, 1);
    const nearLadder = f.x > cam.ladderMinX && f.z > cam.ladderMinZ && f.y > cam.ladderMinY;
    st.ladderW = clamp(smoothDamp(st.ladderW, nearLadder ? 1 : 0, st.vlw, cam.cornerBlend, dt), 0, 1);

    // Fixed shots: ease into the one Hue is standing in, and back out of it. The controls turn with the camera, so a direction held through
    // the cut keeps its meaning until it is let go (the same latch as a street's flip).
    // A shot that is already on is held a little past its edges (0.12 m), so walking along an edge does not flicker it on and off.
    const inShot =
      cam.shots?.find((sh) => {
        if (st.shotsDone.has(sh)) return false;
        const m = sh === st.shot && st.shotW > 0.05 ? 0.12 : 0;
        return f.x >= sh.x0 - m && f.x <= sh.x1 + m && f.z >= sh.z0 - m && f.z <= sh.z1 + m && f.y <= (sh.y1 ?? Infinity) + m;
      }) ?? null;
    if (inShot !== (st.shotW > 0.5 ? st.shot : null) && (inShot || st.shotW > 0.5)) {
      st.latch = runtime.steering;
      st.latchAngle = runtime.stickAngle;
    }
    if (!inShot && st.shot?.once) st.shotsDone.add(st.shot); // the opening is played: it never comes back
    if (inShot) st.shot = inShot;
    st.shotW = clamp(smoothDamp(st.shotW, inShot ? 1 : 0, st.vsw, cam.shotBlend ?? cam.cornerBlend, dt), 0, 1);
    if (!inShot && st.shotW < 0.002) st.shot = null;

    // Two-sided streets: the camera shows the facades of the side Hue is on. Crossing the street's centre line
    // (z = 0, with a dead band) swings it round to the other side.
    if (cam.twoSided) {
      const want = f.z > cam.flipDeadband ? -1 : f.z < -cam.flipDeadband ? 1 : st.side;
      if (want !== st.side) {
        st.side = want;
        st.latch = runtime.steering; // a direction held through the swing keeps its meaning until let go (or turned well away, see CAMERA.latchRelease)
        st.latchAngle = runtime.stickAngle;
      }
      const goal = st.side > 0 ? 0 : 1;
      st.flip += Math.max(-dt / cam.flipTime, Math.min(dt / cam.flipTime, goal - st.flip));
    }
    runtime.camSide = st.side;
    runtime.camFlip = st.flip * st.flip * (3 - 2 * st.flip);
    // Intro rise: start low, climb to the normal height as Hue walks away from where he began (one way: it stays up).
    if (cam.introDrop) {
      const k = clamp(f.distanceTo(runtime.startFeet) / (cam.introDist ?? 1), 0, 1);
      st.intro = Math.max(st.intro, k * k * (3 - 2 * k));
    }
    const t = targets(st);
    st.x = smoothDamp(st.x, t.x, st.vx, cam.smoothX, dt);
    // The hop over a ledge's lip is quick: follow it closely so Hue never rides up out of frame.
    const rise = runtime.climbing ? cam.climbSmoothScale : 1;
    st.y = smoothDamp(st.y, t.y, st.vy, cam.smoothY * rise, dt);
    st.look.set(
      smoothDamp(st.look.x, t.look.x, st.vlx, cam.smoothLook, dt),
      smoothDamp(st.look.y, t.look.y, st.vly, cam.smoothLook * rise, dt),
      smoothDamp(st.look.z, t.look.z, st.vlz, cam.smoothLook, dt),
    );

    // Blocked view: slide up / sideways until Hue's chest is visible. The camera sits on the +z plane (side +1), on the
    // -z plane (side -1), or swings between them around the street's centre line.
    const theta = Math.PI * runtime.camFlip;
    const plane = runtime.openWallZ + cam.planeOffset;
    const z = plane * Math.cos(theta);
    const orbitX = plane * Math.sin(theta);
    const chest = t.look;
    const want = findClearOffset(st.x + orbitX, st.y, z, chest);
    st.unblock.x = smoothDamp(st.unblock.x, want[0], st.vux, cam.unblockSmooth, dt);
    st.unblock.y = smoothDamp(st.unblock.y, want[1], st.vuy, cam.unblockSmooth, dt);
    let camX = clamp(st.x + st.unblock.x, xmin, xmax) + orbitX;
    let camY = clamp(st.y + st.unblock.y, cam.yMin, st.yMaxNow);
    let camZ = z;
    // Which way he is heading, smoothed: it follows his velocity once he is really moving, and holds while he stands still.
    {
      const vx = (f.x - st.lastX) / dt;
      const vz = (f.z - st.lastZ) / dt;
      st.lastX = f.x;
      st.lastZ = f.z;
      if (Math.hypot(vx, vz) > 0.15) {
        const want = Math.atan2(vz, vx);
        st.want = want;
        const diff = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
        st.heading += diff * (1 - Math.exp(-dt / 0.45));
      }
    }
    const sw = st.shot ? st.shotW * st.shotW * (3 - 2 * st.shotW) : 0;
    if (!(st.shot && sw > 0 && st.shot.followX && !st.shot.chase)) st.sxShot = null; // a followX camera starts afresh from the camera each time its shot comes on
    if (st.shot && sw > 0) {
      // A shot may change as the run goes on (levels.ts `pos2`): the wide opening closes in behind Hue as he walks away from where he began.
      const sh = st.shot;
      const k = sh.pos2 ? THREE.MathUtils.smoothstep(f.distanceTo(runtime.startFeet) / (sh.dist ?? 2), 0, 1) : 0;
      const pos = sh.pos2 ? (sh.pos.map((v, i) => THREE.MathUtils.lerp(v, sh.pos2![i], k)) as [number, number, number]) : sh.pos;
      st.shotFov = sh.fov !== undefined ? THREE.MathUtils.lerp(sh.fov, sh.fov2 ?? sh.fov, k) : 0;
      let shotX = pos[0];
      let shotY = pos[1];
      let shotZ = pos[2];
      if (sh.chase) {
        // Trail behind him, whichever way he is going.
        shotX = f.x - Math.cos(st.heading) * sh.chase.dist;
        shotZ = f.z - Math.sin(st.heading) * sh.chase.dist;
        const bx = sh.chase.box;
        if (bx) {
          shotX = clamp(shotX, bx.x0 ?? -Infinity, bx.x1 ?? Infinity);
          shotZ = clamp(shotZ, bx.z0 ?? -Infinity, bx.z1 ?? Infinity);
        }
        // When he turns back, the camera has to get round to his other side: it rises up and over (so it never swings through the shelves), then comes down.
        const turn = Math.abs(Math.atan2(Math.sin(st.want - st.heading), Math.cos(st.want - st.heading)));
        let wantH = sh.chase.height + (sh.chase.arc ?? 0) * Math.min(1, turn / (Math.PI * 0.6));
        if (sh.chase.lift) {
          const l = sh.chase.lift;
          const k = THREE.MathUtils.clamp((l.from - f.x) / (l.from - l.to), 0, 1);
          wantH += l.extra * k * k * (3 - 2 * k);
        }
        // Never sit inside (or just above the surface of) a counter, case or shelf: rise to clear whatever is under the camera's spot.
        if (!st.obstacles && roomColliders.length) {
          st.obstacles = roomColliders
            .filter((c) => !c.userData.ladder && !c.userData.door && c.userData.standable !== false && c.halfExtents.y * 2 < 2.4 && c.center.y + c.halfExtents.y > 0.2)
            .map((c) => ({ x0: c.center.x - c.halfExtents.x, x1: c.center.x + c.halfExtents.x, z0: c.center.z - c.halfExtents.z, z1: c.center.z + c.halfExtents.z, top: c.center.y + c.halfExtents.y }));
        }
        for (const o of st.obstacles ?? []) {
          if (shotX >= o.x0 - 0.1 && shotX <= o.x1 + 0.1 && shotZ >= o.z0 - 0.1 && shotZ <= o.z1 + 0.1) wantH = Math.max(wantH, o.top + 0.25 - f.y);
        }
        if (!st.chInit) {
          st.ch = wantH;
          st.chInit = true;
        } else {
          st.ch = smoothDamp(st.ch, wantH, st.vch, 0.45, dt);
        }
        shotY = f.y + st.ch;
      } else if (sh.followX) {
        if (st.sxShot !== sh) {
          st.sx = camera.position.x;
          st.vsx.v = 0;
          st.sxShot = sh;
        }
        st.sx = smoothDamp(st.sx, f.x + pos[0], st.vsx, cam.smoothX * 0.6, dt);
        shotX = st.sx;
      }
      camX = THREE.MathUtils.lerp(camX, shotX, sw);
      camY = THREE.MathUtils.lerp(camY, shotY, sw);
      camZ = THREE.MathUtils.lerp(camZ, shotZ, sw);
    }
    // Confined to the shop: inside its walls (the opening shot, which stands outside the door, is the one exception), and never inside a counter, case or
    // shelf he has to climb: lifted clear of whatever the camera would otherwise sit in.
    if (cam.confine) {
      const c = cam.confine;
      const opening = !!st.shot?.pos2 && st.shotW > 0.05 && f.distanceTo(runtime.startFeet) < (st.shot.dist ?? 2) * 0.98;
      camX = clamp(camX, opening ? -99 : c.x0, c.x1);
      camZ = clamp(camZ, c.z0, c.z1);
      if (!st.obstacles && roomColliders.length) {
        st.obstacles = roomColliders
          .filter((o) => !o.userData.ladder && !o.userData.door && o.userData.standable !== false && o.halfExtents.y * 2 < 2.4 && o.center.y + o.halfExtents.y > 0.2)
          .map((o) => ({ x0: o.center.x - o.halfExtents.x, x1: o.center.x + o.halfExtents.x, z0: o.center.z - o.halfExtents.z, z1: o.center.z + o.halfExtents.z, top: o.center.y + o.halfExtents.y }));
      }
      for (const o of st.obstacles ?? []) {
        if (camX >= o.x0 - 0.06 && camX <= o.x1 + 0.06 && camZ >= o.z0 - 0.06 && camZ <= o.z1 + 0.06 && camY < o.top + 0.12) camY = o.top + 0.12;
      }
    }
    // Keep him in view: if a tall fixture is between the camera and Hue (or the camera is inside one), lift the camera, or slide it, until it can see him.
    if (cam.keepInView) {
      if (!st.blockers && roomColliders.length) {
        st.blockers = roomColliders
          .filter((c) => c.userData.view_block)
          .map((c) => ({
            x0: c.center.x - c.halfExtents.x,
            x1: c.center.x + c.halfExtents.x,
            y0: c.center.y - c.halfExtents.y,
            y1: c.center.y + c.halfExtents.y,
            z0: c.center.z - c.halfExtents.z,
            z1: c.center.z + c.halfExtents.z,
          }));
      }
      const boxes = st.blockers ?? [];
      const tx = f.x;
      const ty = f.y + 0.28;
      const tz = f.z;
      // Does the segment from (ax,ay,az) to Hue's chest pass through any blocker? (Slab test; a camera inside a box counts as blocked.)
      const blocked = (ax: number, ay: number, az: number) => {
        for (const b of boxes) {
          let t0 = 0;
          let t1 = 1;
          const d = [tx - ax, ty - ay, tz - az];
          const o = [ax, ay, az];
          const lo = [b.x0, b.y0, b.z0];
          const hi = [b.x1, b.y1, b.z1];
          let hit = true;
          for (let k = 0; k < 3 && hit; k++) {
            if (Math.abs(d[k]) < 1e-9) {
              if (o[k] < lo[k] || o[k] > hi[k]) hit = false;
            } else {
              let a = (lo[k] - o[k]) / d[k];
              let c = (hi[k] - o[k]) / d[k];
              if (a > c) [a, c] = [c, a];
              t0 = Math.max(t0, a);
              t1 = Math.min(t1, c);
              if (t0 > t1) hit = false;
            }
          }
          if (hit && t0 < 0.985) return true;
        }
        return false;
      };
      let needX = 0;
      let needY = 0;
      if (blocked(camX, camY, camZ)) {
        const yTop = cam.yMax + 0.6;
        let best = Infinity;
        for (const dx of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3]) {
          for (let dy = 0; dy <= 3.2 && camY + dy <= yTop; dy += 0.2) {
            if (!blocked(camX + dx, camY + dy, camZ)) {
              const cost = dy + Math.abs(dx) * 1.2;
              if (cost < best) {
                best = cost;
                needX = dx;
                needY = dy;
              }
              break;
            }
          }
        }
      }
      // Lift quickly when something blocks him, ease back down slowly once he is clear (no flicker at the edge of a blocker).
      st.gx = smoothDamp(st.gx, needX, st.vgx, 0.35, dt);
      st.gy = smoothDamp(st.gy, needY, st.vgy, needY > st.gy ? 0.2 : 0.7, dt);
      camX += st.gx;
      camY += st.gy;
    }
    // A last smoothing over the position, if the level asks for it, so a cut from one shot to another eases instead of popping.
    if (cam.finalSmooth) {
      if (!st.pInit) {
        st.px = camX;
        st.py = camY;
        st.pz = camZ;
        st.pInit = true;
      } else {
        st.px = smoothDamp(st.px, camX, st.vpx, cam.finalSmooth, dt);
        st.py = smoothDamp(st.py, camY, st.vpy, cam.finalSmooth, dt);
        st.pz = smoothDamp(st.pz, camZ, st.vpz, cam.finalSmooth, dt);
      }
      camX = st.px;
      camY = st.py;
      camZ = st.pz;
    }
    camera.position.set(camX, camY, camZ);
    runtime.cameraPos.copy(camera.position);
    runtime.cutaway = st.shot?.cutaway && st.shotW > 0.6 ? st.shot.cutaway : null;

    const dx = st.look.x - camX;
    const dy = st.look.y - camY;
    const dz = st.look.z - camZ;
    const horiz = Math.hypot(dx, dz);
    const turn = Math.atan2(-dx, -dz) - theta;
    // In a fixed shot the camera may turn all the way to face down an aisle (the follow shot stays within yawClamp of the wall plane).
    const yawLimit = THREE.MathUtils.lerp(cam.yawClamp, Math.PI, sw);
    const yaw = theta + clamp(Math.atan2(Math.sin(turn), Math.cos(turn)), -yawLimit, yawLimit);
    const pitch = clamp(Math.atan2(dy, horiz), cam.pitchMin, cam.pitchMax);

    const p = peek.current;
    if (!p.dragging) {
      // Right stick peeks too (held = look, released = spring back).
      const pad = pollGamepad();
      p.yaw = smoothDamp(p.yaw, -pad.lookX * cam.peekYaw, p.vy, pad.lookX ? 0.12 : cam.peekReturn, dt);
      p.pitch = smoothDamp(p.pitch, -pad.lookY * cam.peekPitch, p.vp, pad.lookY ? 0.12 : cam.peekReturn, dt);
    }
    euler.current.set(pitch + p.pitch, yaw + p.yaw, 0);
    camera.quaternion.setFromEuler(euler.current);
    runtime.cameraYaw = yaw;
    // The controls follow the camera, except that a direction held through a flip keeps its meaning until it is let go or turned well away from where it was.
    if (st.latch && (!runtime.steering || Math.abs(Math.atan2(Math.sin(runtime.stickAngle - st.latchAngle), Math.cos(runtime.stickAngle - st.latchAngle))) > cam.latchRelease)) st.latch = false;
    if (!st.latch) runtime.moveYaw = yaw;

    const dist = Math.hypot(dx, dy, dz);
    let fovTarget = dist > cam.fovFarDistance ? cam.fovFar : cam.fov;
    if (t.d < cam.frontEdge) fovTarget = cam.fov + (cam.fovFront - cam.fov) * ((cam.frontEdge - t.d) / cam.frontEdge);
    if (FLAGS.PORTRAIT_FOV_BOOST && camera.aspect < 1) {
      const minH = THREE.MathUtils.degToRad(cam.portraitMinHFov);
      const needV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / camera.aspect));
      fovTarget = Math.max(fovTarget, Math.min(needV, cam.portraitMaxVFov));
    }
    if (st.shot && st.shotFov) fovTarget = THREE.MathUtils.lerp(fovTarget, st.shotFov, sw); // a shot can have its own lens
    st.fov = smoothDamp(st.fov, fovTarget, st.vfov, 0.5, dt);
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
