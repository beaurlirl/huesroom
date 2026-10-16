"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { runtime } from "./store";
import { useRoom } from "./useLevel";

/** The stock on the shelves: chips, bottles, boxes. Materials with these names get the wiggle. */
const STOCK = /^(Product|Accessory)/;

type Uniforms = { uHue: { value: THREE.Vector3 }; uTime: { value: number }; uAmp: { value: number } };

/**
 * Vertex shader addition: stock within about 0.85 m of Hue sways, a few millimetres, in groups about the size of a bag (the shelves are a few
 * joined meshes, so this works on the vertices, not on bags one by one). It is read from the same uniforms for every stock material.
 */
const WIGGLE_GLSL = /* glsl */ `
vec3 wiggleP = (modelMatrix * vec4(transformed, 1.0)).xyz;
float wiggleD = distance(wiggleP, uHue + vec3(0.0, 0.25, 0.0));
float wiggleW = smoothstep(0.85, 0.05, wiggleD) * uAmp;
vec3 wiggleCell = floor(wiggleP * 5.0);
float wigglePh = fract(sin(dot(wiggleCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2831853;
transformed += vec3(sin(uTime * 12.0 + wigglePh) * 0.009, 0.0, cos(uTime * 10.0 + wigglePh * 1.7) * 0.007) * wiggleW;
`;

function patch(m: THREE.Material, u: Uniforms) {
  // Once only: React runs effects twice in development, and a second patch would stack on the first and redefine everything.
  if (m.userData.stockWiggle) return;
  m.userData.stockWiggle = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uHue = u.uHue;
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uAmp = u.uAmp;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uHue;\nuniform float uTime;\nuniform float uAmp;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WIGGLE_GLSL}`);
  };
  m.customProgramCacheKey = () => "stock-wiggle";
  m.needsUpdate = true;
}

/** Stock near Hue wiggles gently as he climbs the shelves and wades through the shop: more while he climbs, a little while he walks, nothing when he stands. */
export function StockWiggle() {
  const { scene } = useRoom();
  const u = useMemo<Uniforms>(() => ({ uHue: { value: new THREE.Vector3() }, uTime: { value: 0 }, uAmp: { value: 0 } }), []);
  const activity = useRef(0);
  const last = useRef(new THREE.Vector3());

  useEffect(() => {
    const seen = new Set<THREE.Material>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.name.startsWith("COL_")) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (seen.has(m) || !STOCK.test(m.name)) continue;
        seen.add(m);
        patch(m, u);
      }
    });
  }, [scene, u]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    u.uTime.value += dt;
    u.uHue.value.copy(runtime.feet);
    const moved = runtime.feet.distanceTo(last.current) / Math.max(dt, 1e-3);
    last.current.copy(runtime.feet);
    const mode = runtime.debug.mode;
    const target = runtime.climbing || mode === "ladder" || mode === "climb" ? 1 : Math.min(0.6, moved * 0.8);
    activity.current += (target - activity.current) * Math.min(1, dt * 4);
    u.uAmp.value = activity.current;
  });

  return null;
}
