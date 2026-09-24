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
import { runtime, useGame } from "./store";
import { useHueController } from "./useHueController";

const IDLE_INPUT = { moveX: 0, moveZ: 0, run: false, jump: false };

const UP = new THREE.Vector3(0, 1, 0);

/** Yaw that turns Hue's local +X (his forward) toward a world XZ direction. */
export function yawForDirection(x: number, z: number) {
  return Math.atan2(-z, x);
}

function useSpawn() {
  const { scene } = useGLTF(ASSETS.room, ASSETS.draco);
  return useMemo(() => {
    const node = scene.getObjectByName("SPAWN_Hue_chair");
    if (!node) throw new Error("room.glb: SPAWN_Hue_chair missing");
    node.updateWorldMatrix(true, false);
    const feet = node.getWorldPosition(new THREE.Vector3());
    // facing_xy is Blender XY; three.js direction is (x, 0, -y).
    const [bx, by] = (node.userData.facing_xy as [number, number] | undefined) ?? [0, -1];
    return { feet, yaw: yawForDirection(bx, -by) };
  }, [scene]);
}

export function Hue() {
  const gltf = useGLTF(ASSETS.hue, ASSETS.draco);
  const animGltfs = useGLTF(CLIP_NAMES.map(ASSETS.anim));
  const spawn = useSpawn();
  const phase = useGame((s) => s.phase);

  const root = gltf.scene.children[0]; // "Hue | 0.4572m placement"
  const armature = root.children[0];

  const { clips, seatedRootOffset, rollCurve, climbRiseSpeed } = useMemo(() => {
    const raw = {} as Record<ClipName, THREE.AnimationClip>;
    CLIP_NAMES.forEach((name, i) => (raw[name] = animGltfs[i].animations[0]));
    return prepareClips(raw, root.scale.x * armature.scale.x);
  }, [animGltfs, root, armature]);

  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf.scene]);
  const actions = useMemo(() => {
    const out = {} as Record<ClipName, THREE.AnimationAction>;
    for (const name of CLIP_NAMES) out[name] = mixer.clipAction(clips[name]);
    for (const name of ["sit_to_stand", "jump", "jump_down", "jump_down_2", "fall_roll"] as const) {
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

  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const controller = useHueController(bodyRef, colliderRef, anim, rollCurve, climbRiseSpeed);

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

    root.position.copy(seatedFeet);
    root.rotation.set(0, spawn.yaw, 0);
    runtime.feet.copy(seatedFeet);
    runtime.grounded = true;

    anim.snap("sit");
    gltf.scene.visible = true;
    initInput();
    runtime.hueReady = true;
    return () => {
      runtime.hueReady = false;
    };
  }, [gltf.scene, root, anim, spawn, seatedFeet]);

  // Rise on begin; hand over control when sit_to_stand finishes.
  useEffect(() => {
    if (phase !== "rising") return;
    anim.play("sit_to_stand");
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== actions.sit_to_stand) return;
      anim.play("idle");
      controller.get()?.place(seatedFeet, spawn.yaw);
      useGame.getState().setPhase("playing");
    };
    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
  }, [phase, mixer, actions, anim, controller, seatedFeet, spawn]);

  // ?debug: jump Hue anywhere (feet position, facing in degrees; 0 = +X, 90 = toward -Z).
  useEffect(() => {
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
        position={[seatedFeet.x, seatedFeet.y + HUE.capsuleHalfHeight + HUE.capsuleRadius, seatedFeet.z]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider ref={colliderRef} args={[HUE.capsuleHalfHeight, HUE.capsuleRadius]} />
      </RigidBody>
    </>
  );
}

useGLTF.preload(ASSETS.hue, ASSETS.draco);
CLIP_NAMES.forEach((name) => useGLTF.preload(ASSETS.anim(name)));
