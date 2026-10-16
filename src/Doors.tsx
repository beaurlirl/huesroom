"use client";

import { useFrame } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { useCallback, useEffect, useMemo } from "react";
import * as THREE from "three";
import { colliderMeta } from "./Room";
import { isRunning, runtime, useGame } from "./store";
import { useRoom } from "./useLevel";

type Door = {
  id: string;
  node: THREE.Object3D;
  /** The hinge axis (the node turns about its own x, y or z). */
  axis: "x" | "y" | "z";
  closed: number;
  open: number;
  /** Opens (and stays open) once this coin has been collected, instead of on a sensor. */
  after: string | null;
  seconds: number;
  /** 0 shut .. 1 wide open. */
  k: number;
  /** The sensor: while Hue's feet are inside it, the door stays open. */
  sensor: THREE.Box3 | null;
  /** Whether its solid leaf is switched on right now. */
  solid: boolean;
};

const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * Doors that swing open (a fridge door on a sensor, a deli case's glass dome once you have paid). The model carries, matched by id:
 * a node with `door` and `open_rad` (its origin is the hinge; it turns about `open_axis`, "y" by default, the vertical one), either a box node
 * with `sensor` (hidden; the zone that opens it, which should include the space the door opens onto, so it cannot shut on Hue) or an
 * `open_after` coin name (it opens when that coin is collected and stays open), and the solid leaf: any `COL_*` box with the same `door`,
 * which is switched off while the door is open so Hue can walk through.
 */
export function Doors() {
  const { scene } = useRoom();
  const { world } = useRapier();
  const runId = useGame((s) => s.runId);

  /** Switches a door's solid leaf on or off. (Looked up in the live world each time: the world is rebuilt on a remount.) */
  const setSolid = useCallback(
    (id: string, solid: boolean) => {
      world.colliders.forEach((c) => {
        if (colliderMeta.get(c.handle)?.userData.door === id && c.isEnabled() !== solid) c.setEnabled(solid);
      });
    },
    [world],
  );

  const doors = useMemo(() => {
    scene.updateMatrixWorld(true);
    const sensors = new Map<string, THREE.Box3>();
    scene.traverse((o) => {
      const id = o.userData.sensor as string | undefined;
      if (!id) return;
      o.visible = false;
      sensors.set(id, new THREE.Box3().setFromObject(o));
    });
    const list: Door[] = [];
    scene.traverse((o) => {
      const id = o.userData.door as string | undefined;
      if (!id || o.name.startsWith("COL_")) return;
      const open = (o.userData.open_rad as number | undefined) ?? 0;
      const axis = ((o.userData.open_axis as string | undefined) ?? "y") as "x" | "y" | "z";
      list.push({
        id,
        node: o,
        axis,
        closed: o.rotation[axis],
        open: o.rotation[axis] + open,
        after: (o.userData.open_after as string | undefined) ?? null,
        seconds: (o.userData.open_seconds as number | undefined) ?? 0.9,
        k: 0,
        sensor: sensors.get(id) ?? null,
        solid: true,
      });
    });
    return list;
  }, [scene]);

  // Restart: every door shut and solid again.
  useEffect(() => {
    for (const d of doors) {
      d.k = 0;
      d.solid = true;
      d.node.rotation[d.axis] = d.closed;
      setSolid(d.id, true);
    }
  }, [doors, runId, setSolid]);

  useFrame((_, rawDt) => {
    if (!isRunning() || !doors.length) return;
    const dt = Math.min(rawDt, 1 / 20);
    const f = runtime.feet;
    for (const d of doors) {
      const s = d.sensor;
      const inside = !!s && f.x >= s.min.x && f.x <= s.max.x && f.z >= s.min.z && f.z <= s.max.z && f.y >= s.min.y - 0.05 && f.y <= s.max.y;
      const paid = !!d.after && useGame.getState().collectedNames.includes(d.after);
      const target = inside || paid ? 1 : 0;
      d.k += Math.sign(target - d.k) * Math.min(Math.abs(target - d.k), dt / d.seconds);
      d.node.rotation[d.axis] = d.closed + (d.open - d.closed) * ease(d.k);
      // The leaf is only in the way while the door is (nearly) shut.
      const solid = d.k < 0.02;
      if (solid !== d.solid) {
        d.solid = solid;
        setSolid(d.id, solid);
      }
    }
  });

  return null;
}
