"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { CAMERA as C } from "./config";
import { runtime } from "./store";

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

/**
 * The camera lives on the open-wall plane (z locked). It slides on X and Y and rotates
 * to keep Hue in view. See prompt section 1.6.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const s = useRef({
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

    camera.position.set(st.x, st.y, z);

    const dx = st.look.x - st.x;
    const dy = st.look.y - st.y;
    const dz = st.look.z - z;
    const horiz = Math.hypot(dx, dz);
    const yaw = clamp(Math.atan2(-dx, -dz), -C.yawClamp, C.yawClamp);
    const pitch = clamp(Math.atan2(dy, horiz), C.pitchMin, C.pitchMax);
    euler.current.set(pitch, yaw, 0);
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
