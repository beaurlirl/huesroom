"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { roomColliders } from "./Room";
import { runtime } from "./store";

/** ?debug: standable tops with their heights, and the climb probe. (Rapier wireframes come from <Physics debug>.) */
export function DebugView() {
  const tops = useMemo(
    () =>
      roomColliders
        .filter((c) => c.userData.standable !== false && !c.name.startsWith("COL_Boundary") && !c.name.includes("wall") && !c.name.includes("Ceiling"))
        .map((c) => {
          // World-space top of the (possibly rotated) box.
          const corners = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new THREE.Vector3(x, y, z))));
          const top = Math.max(...corners.map((k) => k.multiply(c.halfExtents).applyQuaternion(c.quaternion).y)) + c.center.y;
          return { name: c.name.replace(/^COL_/, ""), pos: new THREE.Vector3(c.center.x, top, c.center.z), top };
        })
        .filter((t) => t.top > 0.05),
    [],
  );

  // Reachability aid (prompt 2.6): every standable top and its height, lowest first.
  useEffect(() => {
    console.table(
      [...tops].sort((a, b) => a.top - b.top).map((t) => ({ surface: t.name, "top (m)": +t.top.toFixed(3) })),
    );
  }, [tops]);

  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), []);
  const lineObj = useMemo(() => {
    const l = new THREE.Line(geom, new THREE.LineBasicMaterial({ depthTest: false }));
    l.renderOrder = 999;
    return l;
  }, [geom]);
  const line = useRef<THREE.Line>(lineObj);
  useFrame(() => {
    const p = runtime.debug.probe;
    const l = line.current;
    if (!l) return;
    l.visible = !!p?.active;
    if (!p?.active) return;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, p.from.x, p.from.y, p.from.z);
    pos.setXYZ(1, p.to.x, p.to.y, p.to.z);
    pos.needsUpdate = true;
    (l.material as THREE.LineBasicMaterial).color.set(p.hit ? "#22c55e" : "#ef4444");
  });

  return (
    <>
      {tops.map((t) => (
        <Html key={t.name} position={t.pos} center style={{ pointerEvents: "none" }}>
          <div style={{ font: "10px/1.2 ui-monospace, monospace", background: "rgba(255,255,255,0.8)", padding: "1px 4px", borderRadius: 3, whiteSpace: "nowrap" }}>
            {t.name} {t.top.toFixed(2)}
          </div>
        </Html>
      ))}
      <primitive object={lineObj} />
    </>
  );
}
