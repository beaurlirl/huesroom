"use client";

import { useGLTF, useTexture } from "@react-three/drei";
import type { ReactNode } from "react";
import { ASSETS, INTRO_CLIPS, FX_TEXTURES } from "./config";

/**
 * Loads assets needed for the intro before rendering children. Physics components must never
 * render in a pass that suspends: @react-three/rapier creates bodies during render, and a
 * discarded (suspended) render leaks them — we saw 8 book bodies instead of 2.
 *
 * Gameplay clips (walk, run, jump, etc.) load in the background via GameplayClipLoader
 * so the intro can start without waiting for ~1 MB of animation data.
 */
export function AssetGate({ children }: { children: ReactNode }) {
  useGLTF(ASSETS.room, ASSETS.draco);
  useGLTF(ASSETS.hue, ASSETS.draco);
  useGLTF(INTRO_CLIPS.map(ASSETS.anim));
  useTexture(FX_TEXTURES);
  return <>{children}</>;
}
