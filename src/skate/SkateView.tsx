"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SKATE } from "../config";
import { runtime } from "../store";
import { useLevel, useRoom } from "../useLevel";
import { skateData } from "./skateLevel";

type Chunk = { object: THREE.Object3D; sMin: number; sMax: number };

/**
 * How far down a skateboard street is drawn (levels.ts `skate.view`, defaults in SKATE.view), so a long street costs what a short stretch of it does. Three things work together:
 * the camera's far plane stops at the end of the window; a haze of the horizon's colour covers the last stretch, so the end is never a cut edge; and the model's meshes (a street
 * model comes in chunks, a block of buildings each) outside the window, ahead of him and behind, are not drawn at all. Each mesh is placed once, by the stretch of the route its box covers;
 * long ones (the ground, the kerbs) always draw. The window follows him every frame.
 */
export function SkateView() {
  const { scene } = useRoom();
  const level = useLevel();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const world = useThree((s) => s.scene);
  const view = useMemo(() => ({ ...SKATE.view, ...level.skate?.view }), [level]);
  const lane = useMemo(() => skateData(scene, level).lane, [scene, level]);

  const chunks = useMemo(() => {
    const out: Chunk[] = [];
    if (!lane) return out;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const name = (o.userData.name as string | undefined) ?? o.name;
      if (!mesh.isMesh || /^(COL_|COIN_|COURSE_|RAIL_)/.test(name)) return;
      box.setFromObject(mesh);
      let sMin = Infinity;
      let sMax = -Infinity;
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? box.max.x : box.min.x, 0, i & 2 ? box.max.z : box.min.z);
        const s = lane.project(c.x, c.z, 0, Infinity);
        sMin = Math.min(sMin, s);
        sMax = Math.max(sMax, s);
      }
      // A mesh whose box is a long stretch of the street (the ground, the kerbs) is drawn all the time: the far plane and the haze do its work.
      if (sMax - sMin < 2 * (view.ahead + view.behind)) out.push({ object: mesh, sMin, sMax });
    });
    return out;
  }, [scene, lane, view]);

  // The far plane, and the haze over the last stretch.
  useEffect(() => {
    const was = { far: camera.far, fog: world.fog };
    camera.far = view.ahead + 25;
    camera.updateProjectionMatrix();
    world.fog = new THREE.Fog(view.fog, view.ahead * view.fogFrom, view.ahead);
    return () => {
      camera.far = was.far;
      camera.updateProjectionMatrix();
      world.fog = was.fog;
    };
  }, [camera, world, view]);

  useEffect(
    () => () => {
      for (const c of chunks) c.object.visible = true;
    },
    [chunks],
  );

  useFrame(() => {
    const s = runtime.skate.s;
    const lo = s - view.behind;
    const hi = s + view.ahead + 25;
    for (const c of chunks) {
      const show = c.sMax >= lo && c.sMin <= hi;
      if (c.object.visible !== show) c.object.visible = show;
    }
  });

  return null;
}
