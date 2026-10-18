"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SKATE } from "../config";
import { runtime, useGame } from "../store";
import { useLevel } from "../useLevel";

const clamp = THREE.MathUtils.clamp;
const _cam = new THREE.Vector3();
const _look = new THREE.Vector3();

/**
 * The camera of a skateboard level: behind him on the lane, dead centre, looking down the road, so he only ever goes forward into the picture. It stands `dist` metres back
 * along the lane (farther the faster he goes, with a wider lens) and a little above his feet, and aims at the lane a little way ahead of him. It follows the lane's own
 * bends and rises and falls with the ground, but not with his jumps. The controls turn with it, so the stick's up is always forward.
 */
export function SkateCamera() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const level = useLevel();
  const runId = useGame((s) => s.runId);
  const st = useRef({ init: false, s: 0, look: 0, refY: 0, y: 0, fov: SKATE.cam.fov });

  // Restart: back behind him at the start, with no swing.
  useEffect(() => {
    st.current.init = false;
  }, [runId]);

  useFrame((_, rawDt) => {
    const S = runtime.skate;
    const lane = S.lane;
    if (!lane || !runtime.hueReady) return;
    const dt = Math.min(rawDt, 1 / 20);
    const c = { ...SKATE.cam, ...level.skate?.camera };
    const a = st.current;
    const k = clamp(S.speed / SKATE.maxSpeed, 0, 1);
    const feet = runtime.feet;

    // The ground's height he is riding at: it follows climbs and drops, and ignores the bob of a jump.
    if (runtime.grounded || feet.y < a.refY) a.refY = feet.y;
    else if (feet.y - a.refY > c.deadzone) a.refY = feet.y - c.deadzone;

    const wantS = S.s - (c.dist + c.distFast * k);
    const wantLook = S.s + c.lookAhead;
    const wantFov = c.fov + c.fovFast * k;
    if (!a.init) {
      a.init = true;
      a.s = wantS;
      a.look = wantLook;
      a.y = a.refY;
      a.fov = wantFov;
    }
    const f = 1 - Math.exp(-dt / c.follow);
    a.s += (wantS - a.s) * f;
    a.look += (wantLook - a.look) * f;
    a.y += (a.refY - a.y) * (1 - Math.exp(-dt / c.rise));
    a.fov += (wantFov - a.fov) * (1 - Math.exp(-dt / 0.4));

    lane.at(a.s, _cam);
    _cam.y = a.y + c.height;
    lane.at(a.look, _look);
    _look.y = a.y + c.lookHeight;
    camera.position.copy(_cam);
    camera.lookAt(_look);
    if (Math.abs(camera.fov - a.fov) > 0.01) {
      camera.fov = a.fov;
      camera.updateProjectionMatrix();
    }

    // The controls turn with the camera (0 = looking toward -Z), and nothing latches: it never flips.
    const yaw = Math.atan2(-(_look.x - _cam.x), -(_look.z - _cam.z));
    runtime.cameraYaw = yaw;
    runtime.moveYaw = yaw;
    runtime.cameraPos.copy(_cam);
    runtime.camSide = 1;
    runtime.camFlip = 0;
  });

  return null;
}
