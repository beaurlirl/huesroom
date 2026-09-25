"use client";

import { useGLTF } from "@react-three/drei";
import { CuboidCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { playSfx } from "./audio/sfx";
import { ASSETS, BOOKS } from "./config";
import { pushableBodies } from "./pushables";
import { blenderName, colliderMeta } from "./Room";
import { useGame } from "./store";

type Book = {
  name: string;
  node: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  halfExtents: THREE.Vector3;
  center: THREE.Vector3;
  mass: number;
  friction: number;
  restitution: number;
};

/** The two book bodies (also registered as pushables for the controller's kick impulses). */
export const bookBodies = new Set<RapierRigidBody>();

// The book nodes are moved out of the room scene once; cache per scene so a second
// memo pass (React StrictMode) doesn't find them missing.
const cache = new WeakMap<THREE.Object3D, Book[]>();

/**
 * BOOK_KICK_01 (1984) and BOOK_KICK_02 (Meditations, stacked on top) as dynamic bodies
 * (prompt 1.7). Collider: a cuboid from each mesh's local bounds; mass/friction/restitution
 * from userData.
 */
export function Books() {
  const { scene } = useGLTF(ASSETS.room, ASSETS.draco);
  const runId = useGame((s) => s.runId);

  const books = useMemo<Book[]>(() => {
    const cached = cache.get(scene);
    if (cached) return cached;
    const found: Book[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const name = blenderName(o);
      // Exact node names only: multi-material meshes also have children called BOOK_KICK_01_1, …
      if (!/^BOOK_KICK_\d+$/.test(name)) return;
      const u = o.userData as { mass_kg?: number; friction?: number; restitution?: number };
      // Local bounds (children included), before we move the node into a rigid body.
      const box = new THREE.Box3();
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        box.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
        m.castShadow = true;
        m.receiveShadow = true;
      });
      const scale = o.getWorldScale(new THREE.Vector3());
      found.push({
        name,
        node: o,
        position: o.getWorldPosition(new THREE.Vector3()),
        quaternion: o.getWorldQuaternion(new THREE.Quaternion()),
        halfExtents: box.getSize(new THREE.Vector3()).multiply(scale).multiplyScalar(0.5),
        center: box.getCenter(new THREE.Vector3()).multiply(scale),
        mass: u.mass_kg ?? 0.12,
        friction: u.friction ?? 0.6,
        restitution: u.restitution ?? 0.1,
      });
    });
    // The body now carries the transform; the mesh sits at its origin.
    for (const b of found) {
      b.node.removeFromParent();
      b.node.position.set(0, 0, 0);
      b.node.quaternion.identity();
    }
    found.sort((a, b) => a.name.localeCompare(b.name));
    cache.set(scene, found);
    return found;
  }, [scene]);

  const bodies = useRef<(RapierRigidBody | null)[]>([]);

  // Restart: back to the stack on the table.
  useEffect(() => {
    if (runId === 0) return;
    books.forEach((b, i) => {
      const body = bodies.current[i];
      if (!body) return;
      body.setTranslation(b.position, true);
      body.setRotation(b.quaternion, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
  }, [runId, books]);

  return (
    <>
      {books.map((b, i) => (
        <RigidBody
          key={b.name}
          ref={(body) => {
            const prev = bodies.current[i];
            if (prev) {
              bookBodies.delete(prev);
              pushableBodies.delete(prev);
            }
            bodies.current[i] = body;
            if (body) {
              bookBodies.add(body);
              pushableBodies.add(body);
            }
          }}
          type="dynamic"
          colliders={false}
          position={b.position}
          quaternion={b.quaternion}
          ccd
          linearDamping={0.05}
          angularDamping={0.2}
          userData={{ book: b.name }}
          onCollisionEnter={({ rigidBody, other }) => {
            // Soft thud when a book lands on the floor fast enough.
            const meta = other.collider ? colliderMeta.get(other.collider.handle) : undefined;
            if (!rigidBody || meta?.name !== "COL_Floor slab") return;
            const v = rigidBody.linvel();
            const speed = Math.hypot(v.x, v.y, v.z);
            if (speed > BOOKS.thudSpeed) playSfx("thud", { volume: Math.min(1, speed / 2.5) });
          }}
        >
          <CuboidCollider
            args={[b.halfExtents.x, b.halfExtents.y, b.halfExtents.z]}
            position={b.center}
            mass={b.mass}
            friction={b.friction}
            restitution={b.restitution}
          />
          <primitive object={b.node} />
        </RigidBody>
      ))}
    </>
  );
}
