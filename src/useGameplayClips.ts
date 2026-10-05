"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { DRACOLoader, GLTFLoader } from "three-stdlib";
import { ASSETS, GAMEPLAY_CLIPS } from "./config";

const urls = GAMEPLAY_CLIPS.map(ASSETS.anim);
let loadPromise: Promise<THREE.AnimationClip[]> | null = null;
let loadedClips: THREE.AnimationClip[] | null = null;

function loadAll(): Promise<THREE.AnimationClip[]> {
  if (loadedClips) return Promise.resolve(loadedClips);
  if (loadPromise) return loadPromise;

  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(ASSETS.draco);
  loader.setDRACOLoader(dracoLoader);

  loadPromise = Promise.all(
    urls.map(
      (url) =>
        new Promise<THREE.AnimationClip>((resolve, reject) => {
          loader.load(url, (gltf) => resolve(gltf.animations[0]), undefined, reject);
        })
    )
  ).then((clips) => {
    loadedClips = clips;
    dracoLoader.dispose();
    return clips;
  });

  return loadPromise;
}

export function preloadGameplayClips() {
  loadAll();
}

export function useGameplayClipsAsync(): THREE.AnimationClip[] | null {
  const [clips, setClips] = useState<THREE.AnimationClip[] | null>(loadedClips);

  useEffect(() => {
    if (clips) return;
    loadAll().then(setClips);
  }, [clips]);

  return clips;
}

export function getGameplayClips(): THREE.AnimationClip[] | null {
  return loadedClips;
}
