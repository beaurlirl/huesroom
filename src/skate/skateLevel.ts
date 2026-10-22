import * as THREE from "three";
import type { LevelDef } from "../levels";
import { runtime } from "../store";
import { generateCourse, type Course } from "./course";
import { Lane, readRoute } from "./lane";
import { readRails, type Rail } from "./rails";

/** What a skateboard level's model adds up to once it has loaded: the path he rides, the gameplay laid along it (if the level has a `course`), and every rail he can grind. */
export type SkateData = { lane: Lane | null; course: Course | null; rails: Rail[] };

const cache = new WeakMap<THREE.Object3D, SkateData>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const coinGeometry = new THREE.CylinderGeometry(0.065, 0.065, 0.02, 24).rotateX(Math.PI / 2);
const coinMaterial = new THREE.MeshPhysicalMaterial({ color: "#c9ccd4", metalness: 1, roughness: 0.12 });

/**
 * Reads a skateboard level's model once (it is cached on the loaded scene, so every caller gets the same lane and rails): the `SKATE_ROUTE` node, the `RAIL_nn` nodes, and, for a level with a
 * `course`, generates it and adds its pieces and coins to the scene (as `COURSE_*` meshes and `COIN_nnn` nodes, so the coin counting and pickup need to know nothing about where they came from).
 * Its colliders are mounted by SkateCourse.tsx.
 */
export function skateData(scene: THREE.Object3D, level: LevelDef): SkateData {
  const hit = cache.get(scene);
  if (hit) return hit;
  const pts = readRoute(scene, level.skate?.route ?? "SKATE_ROUTE");
  const lane = pts ? new Lane(pts) : null;
  const opts = level.skate?.course;
  const course = lane && opts ? generateCourse(lane, { seed: opts.seed, start: opts.start ?? 25, end: opts.end ?? lane.length - 30, gap: opts.gap ?? [9, 6] }) : null;
  if (course) {
    for (const b of course.boxes) {
      if (!b.render) continue;
      let m = materials.get(b.color);
      if (!m) materials.set(b.color, (m = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.85 })));
      const mesh = new THREE.Mesh(boxGeometry, m);
      mesh.name = `COURSE_${b.name}`;
      mesh.position.copy(b.pos);
      mesh.quaternion.copy(b.quat);
      mesh.scale.copy(b.size);
      scene.add(mesh);
    }
    course.coins.forEach((p, i) => {
      const coin = new THREE.Mesh(coinGeometry, coinMaterial);
      coin.name = `COIN_${String(i + 1).padStart(3, "0")}`;
      coin.position.copy(p);
      coin.userData.collectible = true;
      scene.add(coin);
    });
  }
  runtime.skate.course = course;
  const data = { lane, course, rails: [...readRails(scene), ...(course?.rails ?? [])] };
  cache.set(scene, data);
  return data;
}
