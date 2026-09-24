"use client";

import { useGLTF, useTexture } from "@react-three/drei";
import type { ReactNode } from "react";
import { ASSETS, CLIP_NAMES, FX_TEXTURES } from "./config";

/**
 * Loads every asset before rendering its children. Physics components must never render in a
 * pass that suspends: @react-three/rapier creates bodies during render, and a discarded
 * (suspended) render leaks them — we saw 8 book bodies instead of 2.
 */
export function AssetGate({ children }: { children: ReactNode }) {
  useGLTF(ASSETS.room, ASSETS.draco);
  useGLTF(ASSETS.hue, ASSETS.draco);
  useGLTF(CLIP_NAMES.map(ASSETS.anim));
  useTexture(FX_TEXTURES);
  return <>{children}</>;
}
