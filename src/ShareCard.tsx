"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import * as THREE from "three";
import { BASE_PATH, CAMERA, HUE } from "./config";
import { COIN_COUNT, formatTime, runtime, useGame } from "./store";
import { theme } from "./ui/theme";

// Share card layout (1080×1920, Instagram Story). Restyle here and in ui/theme.ts.
const CARD = { w: 1080, h: 1920, photoH: 1300, pad: 64 };

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

/**
 * Composes the 1080×1920 card on a 2D canvas, after directory.onl: Union, uppercase, a header
 * with a hairline rule, a square-framed photo, a blue kicker over a huge bold time, and a solid
 * blue band announcing the hue.onl unlock.
 */
export async function renderShareCard(time: number): Promise<Blob | null> {
  if (!snapshot) return null;
  await ensureFonts();
  const { w, h, photoH, pad } = CARD;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const family = getComputedStyle(document.documentElement).getPropertyValue(theme.fontVar).trim() || "Helvetica Neue";
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}, "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const up = (t: string) => t.toUpperCase();

  g.fillStyle = theme.paper;
  g.fillRect(0, 0, w, h);
  g.textBaseline = "alphabetic";

  // Header: wordmark, hairline, date.
  const headerY = pad + 56;
  g.fillStyle = theme.ink;
  g.font = font(700, 68);
  g.fillText(up(theme.wordmark), pad, headerY);
  const wordW = g.measureText(up(theme.wordmark)).width;
  const date = up(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
  g.font = font(400, 34);
  const dateW = g.measureText(date).width;
  g.fillText(date, w - pad - dateW, headerY);
  g.fillRect(pad + wordW + 28, headerY - 22, w - pad * 2 - wordW - dateW - 56, 2);

  // Photo: square corners, hairline frame.
  const photoTop = headerY + 44;
  const photo = snapshot(w - pad * 2, photoH - photoTop);
  const tmp = document.createElement("canvas");
  tmp.width = photo.width;
  tmp.height = photo.height;
  tmp.getContext("2d")!.putImageData(photo, 0, 0);
  g.drawImage(tmp, pad, photoTop);
  g.lineWidth = 2;
  g.strokeStyle = theme.ink;
  g.strokeRect(pad + 1, photoTop + 1, photo.width - 2, photo.height - 2);

  // Kicker + time.
  const kickerY = photoTop + photo.height + 86;
  g.fillStyle = theme.blue;
  g.fillRect(pad, kickerY - 24, 22, 22);
  g.font = font(700, 34);
  g.fillText(up(`all ${COIN_COUNT} coins`), pad + 40, kickerY);
  g.fillStyle = theme.ink;
  g.font = font(700, 250);
  g.fillText(formatTime(time), pad - 8, kickerY + 230);

  // Blue band: the unlock, and where to play.
  const bandH = 150;
  g.fillStyle = theme.blue;
  g.fillRect(0, h - bandH, w, bandH);
  g.fillStyle = theme.paper;
  g.font = font(700, 44);
  g.fillText(up(`unlocked ${theme.unlockLabel}`), pad, h - bandH / 2 + 16);
  const link = up(`${window.location.host}${BASE_PATH}`);
  g.font = font(400, 32);
  g.fillText(link, w - pad - g.measureText(link).width, h - bandH / 2 + 12);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function shareCaption(time: number) {
  return `i got all ${COIN_COUNT} coins in ${formatTime(time)} in ${theme.wordmark} and unlocked ${theme.unlockLabel} → ${window.location.origin}${BASE_PATH}`;
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

  // Render the card as soon as the win panel shows: iOS only allows navigator.share within a
  // short window after the tap, which the render (fonts, per-pixel tone mapping) can outlast.
  const [card, setCard] = useState<{ time: number; blob: Blob } | null>(null);
  useEffect(() => {
    if (!result) return;
    let cancelled = false;
    // Let the win frame settle first so the snapshot shows Hue at rest.
    const t = setTimeout(() => {
      void renderShareCard(result.time).then((blob) => {
        if (!cancelled && blob) setCard({ time: result.time, blob });
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [result]);

  if (!result) return null;

  const download = async (blob: Blob, text: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hues-room.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    try {
      await navigator.clipboard.writeText(text);
      setToast("card saved · caption copied");
    } catch {
      setToast("card saved");
    }
  };

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = card?.time === result.time ? card.blob : await renderShareCard(result.time);
      if (!blob) return;
      const file = new File([blob], "hues-room.png", { type: "image/png" });
      const text = shareCaption(result.time);
      // Phones get the share sheet (Instagram Stories/Feed/DM live there). Desktop browsers
      // may support file sharing too, but the prompt wants download + caption there.
      const phone = window.matchMedia("(pointer: coarse)").matches;
      if (phone && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return; // sheet dismissed
          // NotAllowedError (activation expired) or anything else: fall back to download.
        }
      }
      await download(blob, text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={onShare} className="ui-btn pointer-events-auto text-sm" style={{ opacity: busy ? 0.6 : 1 }}>
        {busy ? "sharing…" : "share"}
      </button>
      {toast && (
        <div
          className="ui fixed left-1/2 -translate-x-1/2 px-4 py-2.5 text-xs"
          style={{ bottom: "calc(24px + env(safe-area-inset-bottom))", background: theme.paper, color: theme.blue, animation: "ui-rise 0.3s ease-out" }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
