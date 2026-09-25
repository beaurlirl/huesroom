"use client";

import { Bloom, EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { BLOOM } from "./config";
import { useIsTouch } from "./Hud";

/**
 * Bloom for the coins and glints (prompt 2.7), off on phones. The composer turns the
 * renderer's tone mapping off, so ACES is re-applied as the last effect.
 *
 * Bloom sees linear light *before* tone mapping: the sunlit white chair and book pages are
 * already ~2.0 there, while chrome highlights (reflecting the environment's light panels)
 * and the boosted glints are far brighter. The prompt's ~0.75 is a tone-mapped value; 2.2
 * here keeps the whites from glowing.
 */
export function Effects() {
  const touch = useIsTouch();
  if (touch) return null;
  return (
    <EffectComposer multisampling={4}>
      {/* Contact shading where things meet (couch/floor, corners, Hue's feet) grounds the room. */}
      <N8AO aoRadius={0.22} distanceFalloff={0.6} intensity={2.2} quality="medium" halfRes color="#1a120a" />
      <Bloom luminanceThreshold={BLOOM.threshold} luminanceSmoothing={0.1} intensity={BLOOM.intensity} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
