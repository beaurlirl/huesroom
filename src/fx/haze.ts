import * as THREE from "three";

/**
 * The blurry ends of a street: a copy of the material that fades to white (the page background) the
 * further its fragments are beyond [xMin, xMax] along the street, over `span` metres.
 */
export function hazeMaterial(src: THREE.Material, h: { xMin: number; xMax: number; span: number }) {
  const m = src.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.hazeMin = { value: h.xMin };
    shader.uniforms.hazeMax = { value: h.xMax };
    shader.uniforms.hazeSpan = { value: h.span };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vHazeX;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vHazeX = (modelMatrix * vec4(transformed, 1.0)).x;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vHazeX;\nuniform float hazeMin;\nuniform float hazeMax;\nuniform float hazeSpan;")
      .replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), smoothstep(0.0, hazeSpan, max(hazeMin - vHazeX, vHazeX - hazeMax)));",
      );
  };
  m.customProgramCacheKey = () => `haze:${h.xMin}:${h.xMax}:${h.span}`;
  return m;
}
