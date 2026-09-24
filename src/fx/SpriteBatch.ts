import * as THREE from "three";

/**
 * Camera-facing sprites drawn in one instanced call. Each instance has a position, size,
 * rotation, opacity, colour and one of up to four textures. Write into the arrays, then
 * call `commit(count)` once per frame.
 */
export class SpriteBatch {
  readonly mesh: THREE.Mesh;
  readonly offset: Float32Array;
  readonly scale: Float32Array;
  readonly rotation: Float32Array;
  readonly opacity: Float32Array;
  readonly tex: Float32Array;
  readonly color: Float32Array;
  private geom: THREE.InstancedBufferGeometry;
  private attrs: THREE.InstancedBufferAttribute[];

  constructor(
    readonly capacity: number,
    textures: THREE.Texture[],
    { additive = false, toneMapped = true }: { additive?: boolean; toneMapped?: boolean } = {},
  ) {
    const plane = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute("position", plane.attributes.position);
    g.setAttribute("uv", plane.attributes.uv);

    this.offset = new Float32Array(capacity * 3);
    this.scale = new Float32Array(capacity);
    this.rotation = new Float32Array(capacity);
    this.opacity = new Float32Array(capacity);
    this.tex = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3).fill(1);
    const mk = (arr: Float32Array, size: number, name: string) => {
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.attrs = [
      mk(this.offset, 3, "iOffset"),
      mk(this.scale, 1, "iScale"),
      mk(this.rotation, 1, "iRot"),
      mk(this.opacity, 1, "iOpacity"),
      mk(this.tex, 1, "iTex"),
      mk(this.color, 3, "iColor"),
    ];
    g.instanceCount = 0;
    this.geom = g;

    const t = [0, 1, 2, 3].map((i) => textures[Math.min(i, textures.length - 1)]);
    const material = new THREE.ShaderMaterial({
      uniforms: { t0: { value: t[0] }, t1: { value: t[1] }, t2: { value: t[2] }, t3: { value: t[3] } },
      vertexShader: /* glsl */ `
        attribute vec3 iOffset;
        attribute float iScale;
        attribute float iRot;
        attribute float iOpacity;
        attribute float iTex;
        attribute vec3 iColor;
        varying vec2 vUv;
        varying float vOpacity;
        varying float vTex;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vOpacity = iOpacity;
          vTex = iTex;
          vColor = iColor;
          vec4 mv = modelViewMatrix * vec4(iOffset, 1.0);
          float c = cos(iRot), s = sin(iRot);
          vec2 p = position.xy * iScale;
          mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D t0;
        uniform sampler2D t1;
        uniform sampler2D t2;
        uniform sampler2D t3;
        varying vec2 vUv;
        varying float vOpacity;
        varying float vTex;
        varying vec3 vColor;
        void main() {
          vec4 s = vTex < 0.5 ? texture2D(t0, vUv) : vTex < 1.5 ? texture2D(t1, vUv) : vTex < 2.5 ? texture2D(t2, vUv) : texture2D(t3, vUv);
          float a = s.a * vOpacity;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor * s.rgb, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped,
    });

    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }

  commit(count: number) {
    this.geom.instanceCount = Math.min(count, this.capacity);
    for (const a of this.attrs) a.needsUpdate = true;
  }

  dispose() {
    this.geom.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
