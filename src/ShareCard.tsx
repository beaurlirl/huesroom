"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { CAMERA, HUE } from "./config";
import { COIN_COUNT, formatTime, runtime, useGame } from "./store";
import { theme } from "./ui/theme";

// Share card layout (1080×1920, Instagram Story). Restyle here and in ui/theme.ts.
const CARD = { w: 1080, h: 1920, photoH: 1320, pad: 72 };

type Snapshot = (w: number, h: number) => ImageData;
let snapshot: Snapshot | null = null;

/** three.js's ACESFilmicToneMapping (exposure 1), then linear → sRGB, in place on one pixel. */
function acesPixel(r: number, g: number, b: number, out: Uint8ClampedArray, i: number) {
  r /= 0.6;
  g /= 0.6;
  b /= 0.6;
  // ACES input matrix (sRGB → AP1-ish), RRT+ODT fit, output matrix.
  const ir = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const ig = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const ib = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const fr = fit(ir);
  const fg = fit(ig);
  const fb = fit(ib);
  const or = 1.60475 * fr - 0.53108 * fg - 0.07367 * fb;
  const og = -0.10208 * fr + 1.10813 * fg - 0.00605 * fb;
  const ob = -0.00327 * fr - 0.07276 * fg + 1.07602 * fb;
  const srgb = (v: number) => {
    v = Math.min(1, Math.max(0, v));
    return (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  };
  out[i] = srgb(or);
  out[i + 1] = srgb(og);
  out[i + 2] = srgb(ob);
  out[i + 3] = 255;
}

/**
 * Lives inside the Canvas: renders a one-off frame of the room (Hue in frame) into an
 * offscreen float target at the card's photo size.
 */
export function ShareSnapshot() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useEffect(() => {
    snapshot = (w, h) => {
      const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, samples: 4 });
      const cam = camera.clone();
      cam.aspect = w / h;
      cam.fov = Math.max(camera.fov, CAMERA.fov + 8); // a little wider for the tall crop
      cam.position.copy(camera.position);
      cam.lookAt(runtime.feet.x, runtime.feet.y + HUE.height * 0.55, runtime.feet.z);
      cam.updateProjectionMatrix();

      const prevTarget = gl.getRenderTarget();
      const prevToneMapping = gl.toneMapping;
      gl.toneMapping = THREE.NoToneMapping;
      gl.setRenderTarget(target);
      gl.render(scene, cam);
      const px = new Float32Array(w * h * 4);
      gl.readRenderTargetPixels(target, 0, 0, w, h, px);
      gl.setRenderTarget(prevTarget);
      gl.toneMapping = prevToneMapping;
      target.dispose();

      const out = new ImageData(w, h);
      for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * w * 4; // WebGL rows are bottom-up
        const dst = y * w * 4;
        for (let x = 0; x < w * 4; x += 4) acesPixel(px[src + x], px[src + x + 1], px[src + x + 2], out.data, dst + x);
      }
      return out;
    };
    return () => {
      snapshot = null;
    };
  }, [gl, scene, camera]);

  return null;
}

async function ensureFonts() {
  try {
    await document.fonts.ready;
  } catch {
    // Font loading API unavailable: the system font fallback is fine.
  }
}

/** Composes the 1080×1920 card on a 2D canvas. */
export async function renderShareCard(time: number): Promise<Blob | null> {
  if (!snapshot) return null;
  await ensureFonts();
  const { w, h, photoH, pad } = CARD;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return null;

  g.fillStyle = theme.paper;
  g.fillRect(0, 0, w, h);

  // Photo, with rounded corners inside the margins.
  const photo = snapshot(w - pad * 2, photoH - pad);
  const tmp = document.createElement("canvas");
  tmp.width = photo.width;
  tmp.height = photo.height;
  tmp.getContext("2d")!.putImageData(photo, 0, 0);
  g.save();
  g.beginPath();
  g.roundRect(pad, pad, photo.width, photo.height, 40);
  g.clip();
  g.drawImage(tmp, pad, pad);
  g.restore();

  const font = getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim() || "system-ui";
  g.fillStyle = theme.ink;
  g.textBaseline = "alphabetic";

  g.font = `500 200px ${font}, system-ui, sans-serif`;
  g.fillText(formatTime(time), pad, photoH + 230);

  g.fillStyle = theme.muted;
  g.font = `400 54px ${font}, system-ui, sans-serif`;
  g.fillText(`${COIN_COUNT} / ${COIN_COUNT} coins`, pad, photoH + 320);

  g.fillStyle = theme.ink;
  g.font = `500 72px ${font}, system-ui, sans-serif`;
  g.fillText(theme.wordmark, pad, h - pad - 70);
  g.fillStyle = theme.muted;
  g.font = `400 40px ${font}, system-ui, sans-serif`;
  g.fillText(window.location.host, pad, h - pad);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function shareCaption(time: number) {
  return `i got all ${COIN_COUNT} coins in ${formatTime(time)} in ${theme.wordmark} → ${window.location.origin}`;
}

/** Win-panel Share button: phone share sheet (Instagram et al.), else download + copy caption. */
export function ShareButton() {
  const result = useGame((s) => s.result);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!result) return null;

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderShareCard(result.time);
      if (!blob) return;
      const file = new File([blob], "hues-room.png", { type: "image/png" });
      const text = shareCaption(result.time);
      // Phones get the share sheet (Instagram Stories/Feed/DM live there). Desktop browsers
      // may support file sharing too, but the prompt wants download + caption there.
      const phone = window.matchMedia("(pointer: coarse)").matches;
      if (phone && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text });
        } catch {
          // Dismissed share sheet: nothing to do.
        }
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      try {
        await navigator.clipboard.writeText(text);
        setToast("card saved · caption copied");
      } catch {
        setToast("card saved");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onShare}
        className="pointer-events-auto rounded-full px-5 py-2 text-sm transition-transform active:scale-95"
        style={{ background: "rgba(17,17,17,0.06)", color: theme.ink, opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "…" : "Share"}
      </button>
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm"
          style={{ bottom: "calc(24px + env(safe-area-inset-bottom))", background: theme.ink, color: theme.paper }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
