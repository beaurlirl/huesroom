import * as THREE from "three";
import { GRADE } from "../config";
import { getLevel } from "../useLevel";

/**
 * The grade's numbers: GRADE, unless the URL says otherwise (`?grade=saturation,contrast,brightness`, for example `?grade=0.4,0.08,-0.03`),
 * so a look can be tried in the browser without touching the code.
 */
export function gradeValues() {
  const raw = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("grade") : null;
  const [saturation, contrast, brightness] = (raw ?? "").split(",").map(Number);
  return {
    saturation: Number.isFinite(saturation) ? saturation : GRADE.saturation,
    contrast: Number.isFinite(contrast) ? contrast : GRADE.contrast,
    brightness: Number.isFinite(brightness) ? brightness : GRADE.brightness,
  };
}

/** Whether this visit should be graded: the street, unless ?raw asks for the model's own colours (for comparing). */
export function gradeWanted() {
  return typeof window !== "undefined" && getLevel().lighting === "street" && !new URLSearchParams(window.location.search).has("raw");
}

const MARK = "// street grade";

/**
 * Colour grade for phones. Desktop grades in the post-processing chain (Effects.tsx); phones have no chain (it costs too much there), so
 * the same maths runs inside every material's shader, after the colour has been converted for the screen (that is where the library's
 * effects work too: the same contrast curve in linear light crushes the darks). The `TONE_MAPPING` guard means it only runs when a
 * material draws straight to the screen (the phone path): inside the desktop composer the materials draw to a render target with tone
 * mapping off, and grading there would grade twice. Patching the shared chunk grades Hue, the coins and the sky as well as the street.
 * Must run before the first material compiles (call it once at start-up).
 */
export function installGrade() {
  if (!gradeWanted() || !THREE.ShaderChunk.colorspace_fragment || THREE.ShaderChunk.colorspace_fragment.includes(MARK)) return;
  const f = (n: number) => n.toFixed(4);
  const g = gradeValues();
  THREE.ShaderChunk.colorspace_fragment =
    THREE.ShaderChunk.colorspace_fragment +
    `
${MARK}
#if defined( TONE_MAPPING )
{
  vec3 gc = gl_FragColor.rgb;
  float gavg = (gc.r + gc.g + gc.b) / 3.0;
  vec3 gdiff = vec3(gavg) - gc;
  gc += gdiff * (1.0 - 1.0 / (1.001 - ${f(g.saturation)}));
  gc += ${f(g.brightness)};
  gc = (gc - 0.5) / (1.0 - ${f(g.contrast)}) + 0.5;
  gl_FragColor.rgb = clamp(gc, 0.0, 1.0);
}
#endif
`;
}
