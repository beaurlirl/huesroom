"use client";

import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useIsTouch } from "./Hud";

/** Env map for the chrome, leather clearcoat, velvet and eyes, plus key/ceiling/fill lights. */
export function Lighting() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const touch = useIsTouch();

  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 0.6, -0.4);
    return o;
  }, []);

  return (
    <>
      <primitive object={target} />
      {/* Warm key from above and in front, through the open side. */}
      <directionalLight
        color="#fff1dc"
        intensity={2.2}
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
      <directionalLight color="#d7e4ff" intensity={0.9} position={[-0.8, 2.8, -3]} target={target} />
      {/* Low warm fill from front-left so the couch side and faces aren't muddy. */}
      <directionalLight color="#ffe9d2" intensity={0.35} position={[-2.5, 1.2, 2.5]} target={target} />
      {/* Soft warm ceiling light, no shadows. */}
      <pointLight color="#ffe2bd" intensity={1.4} distance={5} decay={2} position={[0, 2.45, -0.2]} />
      <hemisphereLight args={["#fbfaf6", "#6d6a58", 0.45]} />
    </>
  );
}
