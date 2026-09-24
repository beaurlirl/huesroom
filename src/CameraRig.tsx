"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRapier, type RapierCollider } from "@react-three/rapier";
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { CAMERA as C } from "./config";
import { runtime, useGame } from "./store";

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
  const s = useRef({
    unblock: new THREE.Vector2(),
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
    fov: C.fov,
    vfov: { v: 0 },
  });

  const targets = (st: typeof s.current) => {
    const feet = runtime.feet;
    // Height deadzone: ignore jump bobs, follow once he lands higher (or drops below).
    if (runtime.grounded || feet.y < st.refY) st.refY = feet.y;
    else if (feet.y - st.refY > C.jumpDeadzone) st.refY = feet.y - C.jumpDeadzone;

    const d = clamp(runtime.openWallZ - feet.z, 0, C.roomDepth);
    let y = st.refY + THREE.MathUtils.lerp(C.offsetNear, C.offsetFar, d / C.roomDepth);
    if (d < C.frontEdge) y += C.frontEdgeLift * (C.frontEdge - d);
    return {
      x: clamp(feet.x, -C.xClamp, C.xClamp),
      y: clamp(y, C.yMin, C.yMax),
      look: new THREE.Vector3(feet.x, feet.y + C.chestHeight, feet.z),
      d,
    };
  };

  useLayoutEffect(() => {
    camera.near = C.near;
    camera.fov = C.fov;
    camera.updateProjectionMatrix();
  }, [camera]);

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
      const cx = clamp(x + side, -C.xClamp, C.xClamp);
      const cy = clamp(y + up, C.yMin, C.yMax);
      if (isClear(cx, cy, z, target)) return [side, up];
    }
    return [0, 0];
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const st = s.current;
    const z = runtime.openWallZ + C.planeOffset;

    if (!st.initialised && runtime.hueReady) {
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

    const t = targets(st);
    st.x = smoothDamp(st.x, t.x, st.vx, C.smoothX, dt);
    st.y = smoothDamp(st.y, t.y, st.vy, C.smoothY, dt);
    st.look.set(
      smoothDamp(st.look.x, t.look.x, st.vlx, C.smoothLook, dt),
      smoothDamp(st.look.y, t.look.y, st.vly, C.smoothLook, dt),
      smoothDamp(st.look.z, t.look.z, st.vlz, C.smoothLook, dt),
    );

    // Blocked view: slide up / sideways on the plane until Hue's chest is visible.
    const chest = t.look;
    const want = findClearOffset(st.x, st.y, z, chest);
    st.unblock.x = smoothDamp(st.unblock.x, want[0], st.vux, C.unblockSmooth, dt);
    st.unblock.y = smoothDamp(st.unblock.y, want[1], st.vuy, C.unblockSmooth, dt);
    const camX = clamp(st.x + st.unblock.x, -C.xClamp, C.xClamp);
    const camY = clamp(st.y + st.unblock.y, C.yMin, C.yMax);
    camera.position.set(camX, camY, z);
    runtime.cameraPos.copy(camera.position);

    const dx = st.look.x - camX;
    const dy = st.look.y - camY;
    const dz = st.look.z - z;
    const horiz = Math.hypot(dx, dz);
    const yaw = clamp(Math.atan2(-dx, -dz), -C.yawClamp, C.yawClamp);
    const pitch = clamp(Math.atan2(dy, horiz), C.pitchMin, C.pitchMax);

    const p = peek.current;
    if (!p.dragging) {
      p.yaw = smoothDamp(p.yaw, 0, p.vy, C.peekReturn, dt);
      p.pitch = smoothDamp(p.pitch, 0, p.vp, C.peekReturn, dt);
    }
    euler.current.set(pitch + p.pitch, yaw + p.yaw, 0);
    camera.quaternion.setFromEuler(euler.current);
    runtime.cameraYaw = yaw;

    const dist = Math.hypot(dx, dy, dz);
    let fovTarget = dist > C.fovFarDistance ? C.fovFar : C.fov;
    if (t.d < C.frontEdge) fovTarget = C.fov + (C.fovFront - C.fov) * ((C.frontEdge - t.d) / C.frontEdge);
    st.fov = smoothDamp(st.fov, fovTarget, st.vfov, 0.5, dt);
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
