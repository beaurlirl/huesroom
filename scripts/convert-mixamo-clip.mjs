// Turns a Mixamo FBX animation ("Without Skin", downloaded for Hue's rig) into a clip glb in the format the other clips in public/hue/anim/ have, so the game can load it.
//   node scripts/convert-mixamo-clip.mjs <clip.fbx> <out.glb> [template.glb]
//
// The skeleton, names and clip layout come from an existing clip (default public/hue/anim/run.glb); the animation in it is replaced by the FBX's. Two things differ between what
// three's FBX loader reads and what those glb clips hold, found by comparing a clip with the FBX it came from: the Hips position is (x, y, z) -> (z, -x, -y), and the Hips
// rotation is turned by a constant quarter-and-a-bit (q' = R q, R = (-0.5, 0.5, -0.5, 0.5)); every other bone's rotation is the same. Only the bones the FBX animates get tracks.
import fs from "fs";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const [src, dst, templateFile = "public/hue/anim/run.glb"] = process.argv.slice(2);
if (!src || !dst) {
  console.error("usage: node scripts/convert-mixamo-clip.mjs <clip.fbx> <out.glb> [template.glb]");
  process.exit(1);
}
const toBuffer = (p) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const clip = new FBXLoader().parse(toBuffer(src), "").animations[0];
if (!clip) throw new Error("no animation in the FBX");

// ---- the template glb: JSON chunk + BIN chunk
const tb = Buffer.from(toBuffer(templateFile));
const jlen = tb.readUInt32LE(12);
const doc = JSON.parse(tb.subarray(20, 20 + jlen).toString());
const binStart = 20 + jlen + 8;
const bin = tb.subarray(binStart, binStart + tb.readUInt32LE(20 + jlen));
const nodeOf = new Map(doc.nodes.map((n, i) => [n.name, i]));

const R = new THREE.Quaternion(-0.5, 0.5, -0.5, 0.5);
const chunks = [bin];
let size = bin.length;
doc.bufferViews ??= [];
doc.accessors ??= [];
const addAccessor = (array, type, count, minmax) => {
  const pad = (4 - (size % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); size += pad; }
  const data = Buffer.from(new Float32Array(array).buffer);
  doc.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: data.length });
  chunks.push(data);
  size += data.length;
  doc.accessors.push({ bufferView: doc.bufferViews.length - 1, componentType: 5126, count, type, ...(minmax ?? {}) });
  return doc.accessors.length - 1;
};
const timeAccessors = new Map();
const samplers = [];
const channels = [];
const missing = [];
for (const t of clip.tracks) {
  const dot = t.name.lastIndexOf(".");
  const bone = t.name.slice(0, dot);
  const path = t.name.slice(dot + 1);
  const node = nodeOf.get(bone.replace(/^mixamorig/, "mixamorig:"));
  if (node === undefined) { missing.push(bone); continue; }
  const key = Array.from(t.times).join(",");
  if (!timeAccessors.has(key)) timeAccessors.set(key, addAccessor(t.times, "SCALAR", t.times.length, { min: [t.times[0]], max: [t.times[t.times.length - 1]] }));
  let values = Array.from(t.values);
  if (path === "position") {
    if (bone !== "mixamorigHips") continue;
    values = values.flatMap((_, i) => (i % 3 ? [] : [values[i + 2], -values[i], -values[i + 1]]));
  } else if (path === "quaternion" && bone === "mixamorigHips") {
    const q = new THREE.Quaternion();
    values = Array.from({ length: values.length / 4 }, (_, i) => { q.fromArray(values, i * 4); q.premultiply(R); return [q.x, q.y, q.z, q.w]; }).flat();
  } else if (path !== "quaternion") continue;
  const out = addAccessor(values, path === "position" ? "VEC3" : "VEC4", t.times.length);
  samplers.push({ input: timeAccessors.get(key), output: out, interpolation: "LINEAR" });
  channels.push({ sampler: samplers.length - 1, target: { node, path: path === "position" ? "translation" : "rotation" } });
}
doc.animations = [{ name: "Animation", samplers, channels }];
doc.buffers[0].byteLength = size;

// ---- write the glb
const newBin = Buffer.concat(chunks);
const pad4 = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
const json = pad4(Buffer.from(JSON.stringify(doc)), 0x20);
const binChunk = pad4(newBin, 0);
const out = Buffer.alloc(12 + 8 + json.length + 8 + binChunk.length);
out.write("glTF", 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(out.length, 8);
out.writeUInt32LE(json.length, 12);
out.write("JSON", 16);
json.copy(out, 20);
out.writeUInt32LE(binChunk.length, 20 + json.length);
out.write("BIN\0", 24 + json.length);
binChunk.copy(out, 28 + json.length);
fs.writeFileSync(dst, out);
console.log(`${dst}: ${(out.length / 1024).toFixed(0)} KB, ${clip.duration.toFixed(3)} s, ${channels.length} tracks${missing.length ? `, no node for: ${[...new Set(missing)].join(", ")}` : ""}`);
