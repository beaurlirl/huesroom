"use client";

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useMemo } from "react";
import { useLevel, useRoom } from "../useLevel";
import { skateData } from "./skateLevel";

/** The colliders of a skateboard level's generated course (its drawn pieces were added to the scene by skateData): kerbs, barriers, ramps, rail ledges. */
export function SkateCourse() {
  const { scene } = useRoom();
  const level = useLevel();
  const boxes = useMemo(() => skateData(scene, level).course?.boxes.filter((b) => b.collide) ?? [], [scene, level]);
  return (
    <RigidBody type="fixed" colliders={false}>
      {boxes.map((b) => (
        <CuboidCollider key={b.name} name={`COL_${b.name}`} args={[b.size.x / 2, b.size.y / 2, b.size.z / 2]} position={b.pos} quaternion={b.quat} />
      ))}
    </RigidBody>
  );
}
