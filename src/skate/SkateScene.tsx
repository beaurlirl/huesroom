"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MOVE } from "../config";
import { blenderName } from "../Room";
import { runtime, useGame } from "../store";
import { useLevel, useRoom } from "../useLevel";
import type { Lane } from "./lane";

const WHEEL_R = 0.014;
const DECK = new THREE.MeshStandardMaterial({ color: "#d1a06a", roughness: 0.55 });
const GRIP = new THREE.MeshStandardMaterial({ color: "#1b1b1d", roughness: 0.95 });
const TRUCK = new THREE.MeshStandardMaterial({ color: "#a9adb3", roughness: 0.35, metalness: 0.8 });
const WHEEL = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.45 });

/** Hue's board, drawn from the skateboard mover's state: it sits under his feet, points along the lane, tilts with a pop or a sloped rail and turns its wheels with his speed. */
export function SkateBoard() {
  const root = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group[]>([]);

  const geo = useMemo(
    () => ({
      deck: new THREE.BoxGeometry(0.17, 0.008, 0.09),
      kick: new THREE.BoxGeometry(0.04, 0.008, 0.09),
      grip: new THREE.BoxGeometry(0.17, 0.001, 0.088),
      truck: new THREE.BoxGeometry(0.012, 0.008, 0.07),
      wheel: new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.014, 14).rotateX(Math.PI / 2),
    }),
    [],
  );
  useLayoutEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  useFrame(() => {
    const S = runtime.skate;
    const g = root.current;
    if (!g || !S.active) return;
    g.position.set(runtime.feet.x, runtime.feet.y - MOVE.offset, runtime.feet.z);
    g.rotation.set(0, S.heading, 0);
    if (tilt.current) tilt.current.rotation.z = S.pitch;
    for (const w of wheels.current) if (w) w.rotation.z = -S.wheel;
  });

  const y = WHEEL_R + 0.008 + 0.004; // deck centre: wheel, truck, half the deck
  return (
    <group ref={root}>
      <group ref={tilt} position={[0, 0, 0]}>
        <mesh geometry={geo.deck} material={DECK} position={[0, y, 0]} castShadow />
        <mesh geometry={geo.grip} material={GRIP} position={[0, y + 0.0045, 0]} />
        {[-1, 1].map((k) => (
          <mesh key={`kick${k}`} geometry={geo.kick} material={DECK} position={[k * 0.1, y + 0.006, 0]} rotation={[0, 0, k * 0.4]} castShadow />
        ))}
        {[-1, 1].map((k) => (
          <mesh key={`truck${k}`} geometry={geo.truck} material={TRUCK} position={[k * 0.06, y - 0.0075, 0]} />
        ))}
        {[-1, 1].flatMap((kx) =>
          [-1, 1].map((kz) => (
            <group key={`wheel${kx}${kz}`} position={[kx * 0.06, WHEEL_R, kz * 0.037]} ref={(el) => {
              if (el) wheels.current[kx + 1 + (kz + 1) / 2] = el;
            }}>
              <mesh geometry={geo.wheel} material={WHEEL} castShadow />
            </group>
          )),
        )}
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
