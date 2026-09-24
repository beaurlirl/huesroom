"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { prepareClips } from "./clips";
import { ASSETS, CLIP_NAMES, HUE, type ClipName } from "./config";
import { runtime, useGame } from "./store";

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

  const { clips, seatedRootOffset } = useMemo(() => {
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
  const current = useRef<ClipName>("sit");

  const crossfadeTo = (name: ClipName, duration = HUE.crossfade) => {
    const from = actions[current.current];
    const to = actions[name];
    if (from === to) return;
    to.reset().setEffectiveWeight(1).play();
    from.crossFadeTo(to, duration, false);
    current.current = name;
  };

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

    const seated = seatedRootOffset.clone().applyAxisAngle(UP, spawn.yaw).add(spawn.feet);
    root.position.copy(seated);
    root.rotation.set(0, spawn.yaw, 0);
    runtime.feet.copy(seated);

    mixer.stopAllAction();
    actions.sit.reset().play();
    current.current = "sit";
    mixer.update(0);
    gltf.scene.visible = true;
    runtime.hueReady = true;
    return () => {
      runtime.hueReady = false;
    };
  }, [gltf.scene, root, mixer, actions, spawn, seatedRootOffset]);

  // Rise on begin; hand over control when sit_to_stand finishes.
  useEffect(() => {
    if (phase !== "rising") return;
    crossfadeTo("sit_to_stand");
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== actions.sit_to_stand) return;
      crossfadeTo("idle");
      useGame.getState().setPhase("playing");
    };
    mixer.addEventListener("finished", onFinished);
    return () => mixer.removeEventListener("finished", onFinished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mixer, actions]);

  useFrame((_, dt) => {
    mixer.update(Math.min(dt, 1 / 20));
  });

  return <primitive object={gltf.scene} />;
}

useGLTF.preload(ASSETS.hue, ASSETS.draco);
CLIP_NAMES.forEach((name) => useGLTF.preload(ASSETS.anim(name)));
