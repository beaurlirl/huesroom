"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ASSETS, MOVE } from "../config";
import { blenderName } from "../Room";
import { runtime, useGame } from "../store";
import { useLevel, useRoom } from "../useLevel";
import type { Lane } from "./lane";

/** Hue's board (the model from scripts/prepare_skate_board.py), drawn from the skateboard mover's state: it sits under his feet, points along the lane, tilts with a pop or a sloped rail and turns its four wheels with his speed. */
export function SkateBoard() {
  const gltf = useGLTF(ASSETS.board, ASSETS.draco);
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  // Its own copy, so a restart or a second mount never shares a parent with the first.
  const board = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const wheels = useMemo(() => [1, 2, 3, 4].map((i) => board.getObjectByName(`WHEEL_${i}`)).filter((w): w is THREE.Object3D => !!w), [board]);
  useLayoutEffect(() => {
    board.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [board]);

  useFrame(() => {
    const S = runtime.skate;
    const g = root.current;
    if (!g || !S.active) return;
    g.position.set(runtime.feet.x, runtime.feet.y - MOVE.offset, runtime.feet.z);
    g.rotation.set(0, S.heading + S.spin, 0);
    if (tilt.current) {
      // A flip rolls the board about its own length, then the pitch tips it; the board drops from his feet while it turns.
      tilt.current.rotation.order = "ZYX";
      tilt.current.rotation.set(S.roll, 0, S.pitch);
      tilt.current.position.y = -S.drop;
    }
    for (const w of wheels) w.rotation.z = -S.wheel;
  });

  return (
    <group ref={root}>
      <group ref={tilt}>
        <primitive object={board} />
      </group>
    </group>
  );
}

/** The finish line of a skateboard level (levels.ts `skate.finish`: a node in the model): the first time he has ridden past it along the lane, the run is won. */
export function SkateFinish() {
  const { scene } = useRoom();
  const level = useLevel();
  const line = useMemo(() => {
    let node: THREE.Object3D | undefined;
    scene.traverse((o) => {
      if (blenderName(o) === level.skate?.finish) node = o;
    });
    if (!node) {
      console.warn(`skate level "${level.id}": finish node ${level.skate?.finish} missing from the model`);
      return null;
    }
    node.visible = false;
    node.updateWorldMatrix(true, false);
    return node.getWorldPosition(new THREE.Vector3());
  }, [scene, level]);
  const at = useRef<{ lane: Lane; s: number } | null>(null);

  useFrame(() => {
    const S = runtime.skate;
    if (!line || !S.lane || useGame.getState().phase !== "playing") return;
    // Where the finish is along this lane (looked up again if the lane is a new one, as when a test teleports him).
    if (at.current?.lane !== S.lane) at.current = { lane: S.lane, s: S.lane.project(line.x, line.z, 0, Infinity) };
    if (S.s >= at.current.s) useGame.getState().finishRun();
  });
  return null;
}
