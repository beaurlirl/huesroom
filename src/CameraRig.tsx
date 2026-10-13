"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, type RapierCollider } from "@react-three/rapier";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CAMERA as BASE_CAMERA, FLAGS } from "./config";
import type { LevelCamera } from "./levels";
import { useIsTouch } from "./Hud";
import { pollGamepad } from "./input/gamepad";
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
  });

  const targets = (st: typeof s.current) => {
    const feet = runtime.feet;
    // Height deadzone: ignore jump bobs, follow once he lands higher (or drops below).
    if (runtime.grounded || feet.y < st.refY) st.refY = feet.y;
    else if (feet.y - st.refY > cam.jumpDeadzone) st.refY = feet.y - cam.jumpDeadzone;

    const d = clamp(runtime.openWallZ - st.side * feet.z, 0, cam.roomDepth);
    let y = st.refY + THREE.MathUtils.lerp(cam.offsetNear, cam.offsetFar, d / cam.roomDepth);
    if (d < cam.frontEdge) y += cam.frontEdgeLift * (cam.frontEdge - d);
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
  /** Only fixed room geometry blocks the view (not Hue, the books or sensors). */
  const blocks = (c: RapierCollider) => !c.isSensor() && !!c.parent()?.isFixed() && !inside.current.has(c.handle);
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
      st.initialised = true;
    }
    if (!st.initialised) return;

    const f = runtime.feet;
    const inCorner = f.x > cam.cornerMinX && f.z < cam.cornerMaxZ;
    st.cornerW = clamp(smoothDamp(st.cornerW, inCorner ? 1 : 0, st.vcw, cam.cornerBlend, dt), 0, 1);
    const nearLadder = f.x > cam.ladderMinX && f.z > cam.ladderMinZ && f.y > cam.ladderMinY;
    st.ladderW = clamp(smoothDamp(st.ladderW, nearLadder ? 1 : 0, st.vlw, cam.cornerBlend, dt), 0, 1);

    // Two-sided streets: the camera shows the facades of the side Hue is on. Crossing the street's centre line
    // (z = 0, with a dead band) swings it round to the other side.
    if (cam.twoSided) {
      const want = f.z > cam.flipDeadband ? -1 : f.z < -cam.flipDeadband ? 1 : st.side;
      if (want !== st.side) {
        st.side = want;
        st.latch = runtime.steering; // a direction held through the swing keeps its meaning until let go
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
    const camX = clamp(st.x + st.unblock.x, xmin, xmax) + orbitX;
    const camY = clamp(st.y + st.unblock.y, cam.yMin, st.yMaxNow);
    camera.position.set(camX, camY, z);
    runtime.cameraPos.copy(camera.position);

    const dx = st.look.x - camX;
    const dy = st.look.y - camY;
    const dz = st.look.z - z;
    const horiz = Math.hypot(dx, dz);
    const turn = Math.atan2(-dx, -dz) - theta;
    const yaw = theta + clamp(Math.atan2(Math.sin(turn), Math.cos(turn)), -cam.yawClamp, cam.yawClamp);
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
    // The controls follow the camera, except that a direction held through a flip keeps its meaning until it is let go.
    if (st.latch && !runtime.steering) st.latch = false;
    if (!st.latch) runtime.moveYaw = yaw;

    const dist = Math.hypot(dx, dy, dz);
    let fovTarget = dist > cam.fovFarDistance ? cam.fovFar : cam.fov;
    if (t.d < cam.frontEdge) fovTarget = cam.fov + (cam.fovFront - cam.fov) * ((cam.frontEdge - t.d) / cam.frontEdge);
    if (FLAGS.PORTRAIT_FOV_BOOST && camera.aspect < 1) {
      const minH = THREE.MathUtils.degToRad(cam.portraitMinHFov);
      const needV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / camera.aspect));
      fovTarget = Math.max(fovTarget, Math.min(needV, cam.portraitMaxVFov));
    }
    st.fov = smoothDamp(st.fov, fovTarget, st.vfov, 0.5, dt);
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
