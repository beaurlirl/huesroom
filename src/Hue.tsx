"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, type RapierCollider, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Animator } from "./animator";
import { prepareClips } from "./clips";
import { ASSETS, CLIP_NAMES, HUE, MOVE, type ClipName } from "./config";
import { initInput, readInput } from "./input";
import { isRunning, runtime, useGame } from "./store";
import { useHueController } from "./useHueController";
import { theme } from "./ui/theme";
import { useLevel, useRoom } from "./useLevel";

const IDLE_INPUT = { moveX: 0, moveZ: 0, run: false, jump: false };

const UP = new THREE.Vector3(0, 1, 0);

/** Yaw that turns Hue's local +X (his forward) toward a world XZ direction. */
export function yawForDirection(x: number, z: number) {
  return Math.atan2(-z, x);
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

export function Hue() {
  const gltf = useGLTF(ASSETS.hue, ASSETS.draco);
  const animGltfs = useGLTF(CLIP_NAMES.map(ASSETS.anim));
  const spawn = useSpawn();
  const level = useLevel();
  const phase = useGame((s) => s.phase);

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
  const controller = useHueController(bodyRef, colliderRef, anim, rollCurve, climbRiseSpeed, topOut);

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
    root.rotation.set(0, spawn.yaw, 0);
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
  }, [gltf.scene, root, anim, spawn, startFeet, startClip]);

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
    return () => {
      runtime.debug.teleport = null;
    };
  }, [controller, anim]);

  useFrame((_, rawDt) => {
    if (!isRunning()) return;
    const dt = Math.min(rawDt, 1 / 30);
    const phase = useGame.getState().phase;
    const mover = controller.get();
    if (mover && (phase === "playing" || phase === "won")) {
      const scripted = runtime.debug.input;
      const input = scripted ? { moveX: scripted.x, moveZ: -scripted.z, run: scripted.run, jump: scripted.jump } : readInput();
      mover.update(dt, phase === "playing" ? input : IDLE_INPUT);
      runtime.debug.mode = mover.mode;
      runtime.debug.probe = mover.debugProbe;
      root.position.copy(mover.feet);
      root.position.y -= MOVE.offset; // the controller keeps a skin gap under the capsule
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
