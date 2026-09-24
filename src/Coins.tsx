"use client";

import { useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { playSfx } from "./audio/sfx";
import { ASSETS, COINS, HUE } from "./config";
import { createCoinEnvironment } from "./fx/coinEnvironment";
import { SpriteBatch } from "./fx/SpriteBatch";
import { blenderName } from "./Room";
import { COIN_COUNT, isRunning, runtime, useGame } from "./store";

type Glint = { t: number; dur: number; wait: number; x: number; y: number; size: number; rot: number };
type Puff = { age: number; life: number; x: number; z: number; rise: number; rot: number; spin: number; peak: number; tex: number; seed: number; burst: boolean };
type Coin = {
  mesh: THREE.Mesh;
  material: THREE.MeshPhysicalMaterial;
  base: THREE.Vector3;
  phase: number;
  collected: boolean;
  popT: number; // seconds since collected (-1 = not yet)
  glints: Glint[];
  puffs: Puff[];
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const SMOKE_GREY = new THREE.Color("#cfd2d6");

function newGlint(): Glint {
  // A random point on the ring (r ≈ 0.058) or on the G's strokes (r ≈ 0.02–0.045).
  const onRing = Math.random() < 0.6;
  const r = onRing ? 0.058 : rand(0.02, 0.045);
  const a = rand(0, Math.PI * 2);
  return {
    t: 0,
    dur: rand(COINS.glintDur[0], COINS.glintDur[1]),
    wait: rand(COINS.glintWait[0], COINS.glintWait[1]),
    x: Math.cos(a) * r,
    y: Math.sin(a) * r,
    size: rand(COINS.glintSize[0], COINS.glintSize[1]),
    rot: rand(0, Math.PI),
  };
}

function newPuff(age = 0, burst = false): Puff {
  const a = rand(0, Math.PI * 2);
  const r = burst ? rand(0, 0.02) : rand(0.01, 0.035);
  return {
    age,
    life: burst ? rand(0.5, 0.8) : rand(2, 3),
    x: Math.cos(a) * r,
    z: Math.sin(a) * r,
    rise: burst ? rand(0.05, 0.09) : rand(0.02, 0.04),
    rot: rand(0, Math.PI * 2),
    spin: rand(-0.6, 0.6),
    peak: burst ? rand(0.3, 0.45) : rand(COINS.smokeOpacity[0], COINS.smokeOpacity[1]),
    tex: Math.floor(rand(0, 4)),
    seed: rand(0, 100),
    burst,
  };
}

const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** The 11 chrome G coins: spin, bob, glints, smoke shimmer, collection (prompt 1.8 / 2.7). */
export function Coins() {
  const { scene } = useGLTF(ASSETS.room, ASSETS.draco);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const coinEnv = useMemo(() => createCoinEnvironment(gl), [gl]);
  useEffect(() => () => coinEnv.dispose(), [coinEnv]);
  const [sparkle, ...smokeTex] = useTexture([
    "/fx/sparkle.png",
    "/fx/smoke_puff_0.png",
    "/fx/smoke_puff_1.png",
    "/fx/smoke_puff_2.png",
    "/fx/smoke_puff_3.png",
  ]);
  const runId = useGame((s) => s.runId);

  const smokePerCoin = useMemo(() => (isTouch() ? COINS.smokePerCoinMobile : COINS.smokePerCoin), []);

  const coins = useMemo<Coin[]>(() => {
    const list: Coin[] = [];
    scene.traverse((o) => {
      const name = blenderName(o);
      if (!/^COIN_\d+$/.test(name)) return;
      const mesh = o as THREE.Mesh;
      // Own material per coin so each can fade out on its own.
      const material = (mesh.material as THREE.MeshPhysicalMaterial).clone();
      material.envMap = coinEnv;
      material.envMapIntensity = COINS.envMapIntensity;
      material.transparent = true;
      mesh.material = material;
      mesh.castShadow = true;
      list.push({
        mesh,
        material,
        base: mesh.position.clone(),
        phase: 0,
        collected: false,
        popT: -1,
        glints: [],
        puffs: [],
      });
    });
    list.sort((a, b) => blenderName(a.mesh).localeCompare(blenderName(b.mesh)));
    list.forEach((c, i) => (c.phase = (i / list.length) * Math.PI * 2));
    if (list.length !== COIN_COUNT) console.warn(`room.glb: expected ${COIN_COUNT} coins, found ${list.length}`);
    return list;
  }, [scene, coinEnv]);

  // Restart: every coin back.
  useEffect(() => {
    for (const c of coins) {
      c.collected = false;
      c.popT = -1;
      c.mesh.visible = true;
      c.mesh.scale.setScalar(1);
      c.material.opacity = 1;
      c.glints = Array.from({ length: COINS.glintsPerCoin }, () => {
        const g = newGlint();
        g.wait *= Math.random(); // stagger the first pops
        return g;
      });
      c.puffs = Array.from({ length: smokePerCoin }, (_, i) => {
        const p = newPuff();
        p.age = (i / smokePerCoin) * p.life; // start mid-life so the shimmer is already there
        return p;
      });
    }
  }, [coins, runId, smokePerCoin]);

  const glintBatch = useMemo(
    () => new SpriteBatch(COIN_COUNT * COINS.glintsPerCoin, [sparkle], { additive: true, toneMapped: false }),
    [sparkle],
  );
  const [s0, s1, s2, s3] = smokeTex;
  const smokeBatch = useMemo(
    () => new SpriteBatch(COIN_COUNT * (smokePerCoin + COINS.burstPuffs), [s0, s1, s2, s3]),
    [smokePerCoin, s0, s1, s2, s3],
  );
  useEffect(() => () => glintBatch.dispose(), [glintBatch]);
  useEffect(() => () => smokeBatch.dispose(), [smokeBatch]);

  const clock = useRef(0);
  const tmp = useMemo(
    () => ({ normal: new THREE.Vector3(), toCam: new THREE.Vector3(), p: new THREE.Vector3(), q: new THREE.Quaternion() }),
    [],
  );

  useFrame((_, rawDt) => {
    if (!isRunning()) return;
    const dt = Math.min(rawDt, 1 / 20);
    clock.current += dt;
    const t = clock.current;
    const { normal, toCam, p } = tmp;
    const collecting = useGame.getState().phase === "playing";
    const feet = runtime.feet;
    let gi = 0;
    let si = 0;

    for (const c of coins) {
      const { mesh } = c;

      // Spin (one turn per 2.5 s) and bob (±1.5 cm).
      if (c.popT < 0) {
        mesh.rotation.y = c.phase + (t * Math.PI * 2) / COINS.spinPeriod;
        mesh.position.y = c.base.y + COINS.bob * Math.sin((t * Math.PI * 2) / COINS.bobPeriod + c.phase);
      }

      // Collect: Hue's capsule vs the coin's r=0.08 sensor ball, including mid-jump. (A manual
      // test: Rapier doesn't report sensor overlaps between kinematic and fixed bodies by default.)
      if (!c.collected && collecting) {
        const y0 = feet.y + HUE.capsuleRadius;
        const y1 = feet.y + HUE.capsuleRadius + 2 * HUE.capsuleHalfHeight;
        const cy = THREE.MathUtils.clamp(mesh.position.y, y0, y1);
        const d = Math.hypot(mesh.position.x - feet.x, mesh.position.y - cy, mesh.position.z - feet.z);
        if (d < COINS.sensorRadius + HUE.capsuleRadius) {
          c.collected = true;
          c.popT = 0;
          const n = COIN_COUNT - coins.filter((k) => !k.collected).length;
          playSfx("chime", { pitch: 1 + n * 0.04 });
          for (let k = 0; k < COINS.burstPuffs; k++) c.puffs.push(newPuff(0, true));
          useGame.getState().collect();
        }
      }

      // Pop: scale up and fade over 0.2 s.
      if (c.popT >= 0) {
        c.popT += dt;
        const k = Math.min(1, c.popT / COINS.popTime);
        mesh.scale.setScalar(1 + 0.6 * k);
        c.material.opacity = 1 - k;
        mesh.visible = k < 1;
      }

      mesh.updateMatrixWorld();
      normal.set(0, 0, 1).applyQuaternion(mesh.quaternion);
      toCam.copy(camera.position).sub(mesh.position).normalize();
      const facing = Math.abs(normal.dot(toCam));

      // Glints: pop at random spots on the ring and the G, some timed to the face lining up.
      if (mesh.visible && c.popT < 0) {
        for (const g of c.glints) {
          if (g.wait > 0) {
            g.wait -= dt * (facing > 0.95 ? 4 : 1);
            continue;
          }
          g.t += dt;
          const k = g.t / g.dur;
          if (k >= 1) {
            Object.assign(g, newGlint());
            continue;
          }
          p.set(g.x, g.y, 0.012 * Math.sign(normal.dot(toCam) || 1)).applyMatrix4(mesh.matrixWorld);
          p.addScaledVector(toCam, 0.01);
          glintBatch.offset.set([p.x, p.y, p.z], gi * 3);
          glintBatch.scale[gi] = g.size * Math.sin(Math.PI * k);
          glintBatch.rotation[gi] = g.rot + THREE.MathUtils.degToRad(20) * k;
          glintBatch.opacity[gi] = 1;
          glintBatch.color.set([COINS.glintBoost, COINS.glintBoost, COINS.glintBoost], gi * 3);
          gi++;
        }
      }

      // Smoke shimmer: drifts up, turns, grows 0.10 → 0.18 m, fades over 2–3 s and respawns.
      // Puffs sit slightly behind the coin (away from the camera) so the G stays readable.
      for (let i = c.puffs.length - 1; i >= 0; i--) {
        const pf = c.puffs[i];
        pf.age += dt;
        let k = pf.age / pf.life;
        if (k >= 1) {
          if (pf.burst || c.collected) {
            c.puffs.splice(i, 1);
            continue;
          }
          Object.assign(pf, newPuff());
          k = 0;
        }
        const flicker = 1 + 0.15 * Math.sin(t * 9 + pf.seed);
        const size = pf.burst ? 0.08 + 0.16 * k : COINS.smokeSize[0] + (COINS.smokeSize[1] - COINS.smokeSize[0]) * k;
        p.set(c.base.x + pf.x, c.base.y - 0.01 + pf.rise * k, c.base.z + pf.z);
        if (!pf.burst) p.addScaledVector(toCam, -COINS.smokeBehind);
        smokeBatch.offset.set([p.x, p.y, p.z], si * 3);
        smokeBatch.scale[si] = size;
        smokeBatch.rotation[si] = pf.rot + pf.spin * pf.age;
        smokeBatch.opacity[si] = pf.peak * Math.sin(Math.PI * k) * flicker;
        smokeBatch.tex[si] = pf.tex;
        smokeBatch.color.set([SMOKE_GREY.r, SMOKE_GREY.g, SMOKE_GREY.b], si * 3);
        si++;
      }
    }

    glintBatch.commit(gi);
    smokeBatch.commit(si);
  });

  return (
    <>
      <primitive object={smokeBatch.mesh} renderOrder={5} />
      <primitive object={glintBatch.mesh} renderOrder={6} />
    </>
  );
}
