"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { useIsTouch } from "./Hud";
import { runtime } from "./store";
import { useLevel } from "./useLevel";

/** A pale, hazy city-morning sky (Preetham model), rendered once into the environment map. White at the horizon, so the street's hazy ends blend into it. */
function streetSky() {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  const u = sky.material.uniforms;
  u.turbidity.value = 7;
  u.rayleigh.value = 1.1;
  u.mieCoefficient.value = 0.012;
  u.mieDirectionalG.value = 0.82;
  const el = THREE.MathUtils.degToRad(48);
  const az = THREE.MathUtils.degToRad(200);
  u.sunPosition.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const scene = new THREE.Scene();
  scene.add(sky);
  return scene;
}

/**
 * Env map for the chrome, leather clearcoat, velvet and eyes, plus key/ceiling/fill lights.
 * In a street (level.lighting === "street") the whole rig travels along the street with Hue, and the
 * key light stays on the camera's side, like the open wall of the room. A long interior ("shop") keeps the room's
 * indoor lights and env map, but the rig follows Hue along the shop and in and out of it.
 */
export function Lighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const touch = useIsTouch();
  const level = useLevel();
  const outdoor = level.lighting === "street";
  const follow = level.lighting !== "room";
  const rig = useRef<THREE.Group>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const k = outdoor ? 0.55 : 1; // the street's pale materials need less light than the room's dark ones

  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    // A street gets a daytime sky: it is the background above the roofs and what the cars, glass and chrome reflect.
    // The room keeps its indoor studio environment.
    const env = pmrem.fromScene(outdoor ? streetSky() : new RoomEnvironment(), outdoor ? 0 : 0.04).texture;
    const before = scene.background;
    scene.environment = env;
    scene.environmentIntensity = outdoor ? 0.42 : 0.45;
    if (outdoor) scene.background = env;
    return () => {
      scene.environment = null;
      if (outdoor) scene.background = before;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, outdoor]);

  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 0.6, -0.4);
    return o;
  }, []);

  useFrame(() => {
    if (!follow) return;
    if (rig.current) {
      rig.current.position.x = runtime.feet.x;
      if (!outdoor) rig.current.position.z = runtime.feet.z; // a shop is deep as well as long
    }
    if (key.current && outdoor) key.current.position.z = THREE.MathUtils.lerp(3.6, -3.6, runtime.camFlip);
  });

  return (
    <>
      <group ref={rig}>
        <primitive object={target} />
        {/* Warm key from above and in front, through the open side. */}
        <directionalLight
          ref={key}
          color="#fff1dc"
          intensity={2.2 * k}
          position={[0.7, 3.4, 3.6]}
          target={target}
          castShadow
          shadow-mapSize={touch ? [1024, 1024] : [2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-1.9}
          shadow-camera-right={1.9}
          shadow-camera-top={1.9}
          shadow-camera-bottom={-1.9}
          shadow-camera-near={1}
          shadow-camera-far={8}
        />
        {/* Cool rim from high behind: separates Hue (and the coins) from the busy murals. */}
        <directionalLight color="#d7e4ff" intensity={0.9 * k} position={[-0.8, 2.8, -3]} target={target} />
        {/* Low warm fill from front-left so the couch side and faces aren't muddy. */}
        <directionalLight color="#ffe9d2" intensity={0.35 * k} position={[-2.5, 1.2, 2.5]} target={target} />
        {/* Soft warm ceiling light, no shadows. */}
        <pointLight color="#ffe2bd" intensity={1.4 * k} distance={5} decay={2} position={[0, 2.45, -0.2]} />
      </group>
      <hemisphereLight args={["#fbfaf6", "#6d6a58", 0.45 * k]} />
    </>
  );
}
