"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierCollider, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Animator } from "./animator";
import { prepareClips } from "./clips";
import { ASSETS, CLIP_NAMES, HUE, MOVE, SKATE, type ClipName } from "./config";
import { initInput, readInput } from "./input";
import { isRunning, runtime, useGame } from "./store";
import { useHueController } from "./useHueController";
import { theme } from "./ui/theme";
import { useLevel, useRoom } from "./useLevel";
import { blenderName, roomColliders } from "./Room";
import { SurfaceMap } from "./surface";
import { Lane } from "./skate/lane";
import { skateData } from "./skate/skateLevel";
import type { SkateMover } from "./skate/SkateMover";

const NO_RAILS: never[] = [];
const IDLE_INPUT = { moveX: 0, moveZ: 0, run: false, jump: false, pop: false };

const UP = new THREE.Vector3(0, 1, 0);

/** Yaw that turns Hue's local +X (his forward) toward a world XZ direction. */
export function yawForDirection(x: number, z: number) {
  return Math.atan2(-z, x);
}

/** A skateboard level before he is placed on the board (the title card, the begin prompt): the lane the camera sits behind him on. */
function startSkateLane(route: Lane | null, feet: THREE.Vector3, yaw: number) {
  const lane = route ?? Lane.straight(feet, Math.cos(yaw), -Math.sin(yaw));
  const S = runtime.skate;
  S.lane = lane;
  S.s = lane.project(feet.x, feet.z, 0, Infinity);
  lane.tangent(S.s, S.dir);
  S.speed = 0;
  S.active = true;
  return yawForDirection(S.dir.x, S.dir.z);
}

function useSpawn() {
  const { scene } = useRoom();
  const level = useLevel();
  return useMemo(() => {
    const node = scene.getObjectByName(level.spawn);
    if (!node) throw new Error(`level "${level.id}": spawn node ${level.spawn} missing from ${level.room}`);
    node.updateWorldMatrix(true, false);
    const feet = node.getWorldPosition(new THREE.Vector3());
    // facing_xy is Blender XY; three.js direction is (x, 0, -y).
    const [bx, by] = (node.userData.facing_xy as [number, number] | undefined) ?? [0, -1];
    return { feet, yaw: yawForDirection(bx, -by) };
  }, [scene, level]);
}

/** How far to move his drawn body (m, up is positive) so it stands on the highest drawn top within a hand of his feet: up to a hand up, a little down, and nothing for a difference too small to see. */
function feetLift(surface: SurfaceMap, x: number, y: number, z: number) {
  // Under his whole footprint, not just the one point: standing on the edge of a carton is standing on the carton.
  let top: number | null = null;
  for (const [dx, dz] of FOOTPRINT) {
    const t = surface.topNear(x + dx, z + dz, y, 0.25);
    if (t !== null && (top === null || t > top)) top = t;
  }
  if (top === null) return 0;
  const d = top - y;
  return Math.abs(d) < 0.012 ? 0 : THREE.MathUtils.clamp(d, -0.1, 0.25);
}
const FOOTPRINT: [number, number][] = [[0, 0], [0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03]];

export function Hue() {
  const gltf = useGLTF(ASSETS.hue, ASSETS.draco);
  const animGltfs = useGLTF(CLIP_NAMES.map(ASSETS.anim));
  const spawn = useSpawn();
  const level = useLevel();
  const phase = useGame((s) => s.phase);
  const { scene: roomScene } = useRoom();

  // levels.ts `snapFeet`: the drawn tops of the level, so his drawn body stands on what is drawn (see surface.ts). Built in slices after the level has loaded.
  const surface = useMemo(() => {
    if (!level.snapFeet) return null;
    const box = new THREE.Box3().setFromObject(roomScene);
    const m = new SurfaceMap(box.min.x - 0.2, box.min.z - 0.2, 0.04, box.max.x - box.min.x + 0.4, box.max.z - box.min.z + 0.4);
    m.add(roomScene, (mesh) => {
      if (!mesh.visible) return false;
      for (let o: THREE.Object3D | null = mesh; o; o = o.parent) {
        const n = blenderName(o);
        if (n.startsWith("COL_") || n.startsWith("COIN_") || n.startsWith("BOOK_KICK") || o.userData.sensor) return false;
      }
      return true;
    });
    return m;
  }, [roomScene, level]);
  const lift = useRef(0);

  const root = gltf.scene.children[0]; // "Hue | 0.4572m placement"
  const armature = root.children[0];

  const { clips, seatedRootOffset, rollCurve, climbRiseSpeed, topOut } = useMemo(() => {
    // Drawn smaller than the model's native 0.457 m by HUE.visualScale (set from the native scale so a re-run never shrinks twice).
    root.userData.baseScale ??= root.scale.x;
    root.scale.setScalar((root.userData.baseScale as number) * HUE.visualScale);
    const raw = {} as Record<ClipName, THREE.AnimationClip>;
    CLIP_NAMES.forEach((name, i) => (raw[name] = animGltfs[i].animations[0]));
    return prepareClips(raw, root.scale.x * armature.scale.x);
  }, [animGltfs, root, armature]);

  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf.scene]);
  const actions = useMemo(() => {
    const out = {} as Record<ClipName, THREE.AnimationAction>;
    for (const name of CLIP_NAMES) out[name] = mixer.clipAction(clips[name]);
    for (const name of ["sit_to_stand", "jump", "jump_down", "jump_down_2", "fall_roll", "climb_top"] as const) {
      out[name].setLoop(THREE.LoopOnce, 1);
      out[name].clampWhenFinished = true;
    }
    return out;
  }, [mixer, clips]);
  const anim = useMemo(() => new Animator(mixer, actions, "sit"), [mixer, actions]);
  const seatedFeet = useMemo(
    () => seatedRootOffset.clone().applyAxisAngle(UP, spawn.yaw).add(spawn.feet),
    [seatedRootOffset, spawn],
  );

  // Where he stands when the run starts: on the chair, or (a street) already on his feet at the spawn.
  const startFeet = level.start === "chair" ? seatedFeet : spawn.feet;
  const startClip = level.start === "chair" ? "sit" : "idle";

  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  // A skateboard level: its route, rails and generated course, read from the loaded model once (skate/skateLevel.ts).
  const skate = useMemo(() => (level.mode === "skate" ? skateData(roomScene, level) : null), [roomScene, level]);
  const rails = skate?.rails ?? NO_RAILS;
  const route = skate?.lane ?? null;
  const controller = useHueController(bodyRef, colliderRef, anim, rollCurve, climbRiseSpeed, topOut, rails, route);

  // First visible frame: a clip is bound, playing and evaluated, and the root is placed.
  useLayoutEffect(() => {
    gltf.scene.visible = false;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh || mesh.isMesh) {
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    root.position.copy(startFeet);
    root.rotation.set(0, level.mode === "skate" ? startSkateLane(route, startFeet, spawn.yaw) : spawn.yaw, 0);
    runtime.feet.copy(startFeet);
    runtime.startFeet.copy(startFeet);
    runtime.grounded = true;

    anim.snap(startClip);
    gltf.scene.visible = true;
    initInput();
    runtime.hueReady = true;
    return () => {
      runtime.hueReady = false;
    };
  }, [gltf.scene, root, anim, spawn, startFeet, startClip, level, route]);

  // X-ray (levels.ts `xray`): a second copy of every one of his meshes, drawn only where something is in front of him (the depth test is flipped, and nudged toward the camera so it never competes with his own surface), in the
  // brand blue. It shares his skeleton, so it moves with him; the shelves and counters of a crowded level can then never hide him.
  useLayoutEffect(() => {
    if (!level.xray) return;
    const mat = new THREE.MeshBasicMaterial({ color: theme.blue, transparent: true, opacity: 0.45, depthFunc: THREE.GreaterDepth, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const ghosts: THREE.Object3D[] = [];
    const sources: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible) sources.push(m);
    });
    for (const m of sources) {
      const sk = m as THREE.SkinnedMesh;
      const g: THREE.Mesh = sk.isSkinnedMesh ? new THREE.SkinnedMesh(m.geometry, mat) : new THREE.Mesh(m.geometry, mat);
      g.position.copy(m.position);
      g.quaternion.copy(m.quaternion);
      g.scale.copy(m.scale);
      g.renderOrder = 50;
      g.frustumCulled = false;
      g.castShadow = false;
      g.receiveShadow = false;
      m.parent?.add(g);
      if (sk.isSkinnedMesh) (g as unknown as THREE.SkinnedMesh).bind(sk.skeleton, sk.bindMatrix);
      ghosts.push(g);
    }
    return () => {
      for (const g of ghosts) g.removeFromParent();
      mat.dispose();
    };
  }, [gltf.scene, level]);

  // Rise on begin; hand over control when sit_to_stand finishes.
  useEffect(() => {
    if (phase !== "rising") return;
    if (level.start === "stand") {
      // A street has no chair to rise from: he is already standing, so play begins at once.
      anim.play("idle");
      controller.get()?.place(startFeet, spawn.yaw);
      useGame.getState().setPhase("playing");
      return;
    }
    anim.play("sit_to_stand");
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== actions.sit_to_stand) return;
      anim.play("idle");
      controller.get()?.place(startFeet, spawn.yaw);
      useGame.getState().setPhase("playing");
    };
    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
  }, [phase, mixer, actions, anim, controller, startFeet, spawn, level]);

  // Restart: back on the chair, seated, capsule out of the way of the books.
  const runId = useGame((s) => s.runId);
  useEffect(() => {
    if (runId === 0) return;
    controller.get()?.place(startFeet, spawn.yaw);
    root.position.copy(startFeet);
    root.rotation.set(0, spawn.yaw, 0);
    runtime.feet.copy(startFeet);
    runtime.grounded = true;
    anim.snap(startClip);
  }, [runId, controller, startFeet, startClip, spawn, root, anim]);

  // ?debug: jump Hue anywhere (feet position, facing in degrees; 0 = +X, 90 = toward -Z).
  useEffect(() => {
    (runtime.debug as Record<string, unknown>).anim = anim;
    runtime.debug.teleport = (x, y, z, yawDeg = 90) => {
      const mover = controller.get();
      if (!mover) return;
      mover.place(new THREE.Vector3(x, y, z), (yawDeg * Math.PI) / 180);
      anim.play("idle", { fade: 0 });
    };
    // (tests, skateboard levels) roll at a speed at once.
    runtime.debug.skateSpeed = (v) => (controller.get() as SkateMover | null)?.setSpeed?.(v);
    return () => {
      runtime.debug.teleport = null;
      runtime.debug.skateSpeed = null;
    };
  }, [controller, anim]);

  // For tests: how far his drawn body would be moved at a spot.
  useEffect(() => {
    runtime.debug.feetLift = surface ? (x, y, z) => (surface.ready ? feetLift(surface, x, y, z) : 0) : null;
    runtime.debug.surface = surface;
    return () => {
      runtime.debug.feetLift = null;
      runtime.debug.surface = null;
    };
  }, [surface]);

  // Below every collider in the level there is nothing left to land on: he fell out of the world (a gap in a wall, a ledge over the edge). Back to the start, not into the void.
  const fallY = useRef<number | null>(null);

  useFrame((_, rawDt) => {
    if (surface && !surface.ready) surface.step(3);
    if (!isRunning()) {
      controller.get()?.disarmJump();
      return;
    }
    const dt = Math.min(rawDt, 1 / 30);
    const phase = useGame.getState().phase;
    const mover = controller.get();
    if (mover && (phase === "playing" || phase === "won")) {
      const scripted = runtime.debug.input;
      const input = scripted ? { moveX: scripted.x, moveZ: -scripted.z, run: scripted.run, jump: scripted.jump, pop: scripted.pop, trick: scripted.trick } : readInput();
      mover.update(dt, phase === "playing" ? input : IDLE_INPUT);
      if (fallY.current === null && roomColliders.length) fallY.current = Math.min(...roomColliders.map((c) => c.center.y - c.halfExtents.y)) - 1;
      if (fallY.current !== null && mover.feet.y < fallY.current) {
        mover.place(startFeet, spawn.yaw);
        anim.play("idle", { fade: 0 });
      }
      runtime.debug.mode = mover.mode;
      runtime.debug.probe = mover.debugProbe;
      root.position.copy(mover.feet);
      root.position.y -= MOVE.offset; // the controller keeps a skin gap under the capsule
      // Standing on a drawn top that is above (a row of cartons) or below (a gap between them) the box he really stands on: his drawn body follows the drawn surface, up a hand and down a little.
      // Only when he is on the ground; the physics (and so every route and jump) is untouched.
      let want = 0;
      if (surface?.ready && mover.mode === "ground" && runtime.grounded) want = feetLift(surface, mover.feet.x, mover.feet.y, mover.feet.z);
      lift.current += (want - lift.current) * (1 - Math.exp(-dt / 0.06));
      root.position.y += lift.current;
      if (level.mode === "skate") root.position.y += SKATE.deck; // he stands on the board's deck
      root.rotation.set(0, mover.yaw, 0);
    }
    anim.update(dt);
  });

  return (
    <>
      <primitive object={gltf.scene} />
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[startFeet.x, startFeet.y + HUE.capsuleHalfHeight + HUE.capsuleRadius, startFeet.z]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider ref={colliderRef} args={[HUE.capsuleHalfHeight, HUE.capsuleRadius]} />
      </RigidBody>
    </>
  );
}
