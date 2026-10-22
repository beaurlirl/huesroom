#!/usr/bin/env python3
"""Makes a delivered skate-level model game-ready: adds the route the rider follows as a `SKATE_ROUTE` node (README > "Skate levels").

    python3 scripts/prepare_skate_level.py <model.glb> <route-and-features.json> <out.glb> [--collision <collision.glb> <out-collision.glb>] [--finish-s <metres> <finish node name>]

The model's own geometry is not touched or re-encoded (a Draco-compressed model stays Draco): only the glTF's JSON part gains one empty node whose `route` user data is the list of
[x, y, z] points, in the model's world axes (y up), in riding order. The route file is in Blender axes (x, y, z up); glTF's are (x, z, -y).
With `--finish-s`, the named finish node is moved onto the route that many metres (measured along the ground) from its start: for a route whose last stretch the game cannot yet ride.
"""
import json
import shutil
import struct
import sys


def read_glb(path):
    b = open(path, "rb").read()
    magic, version, _ = struct.unpack("<4sII", b[:12])
    assert magic == b"glTF" and version == 2, "not a glb"
    jlen, jtype = struct.unpack("<I4s", b[12:20])
    assert jtype == b"JSON"
    doc = json.loads(b[20 : 20 + jlen])
    rest = b[20 + jlen :]  # the BIN chunk (and anything after it), untouched
    return doc, rest


def write_glb(path, doc, rest):
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + len(rest)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(rest)
    return total


def main():
    args = sys.argv[1:]
    collision = None
    if "--collision" in args:
        i = args.index("--collision")
        collision = args[i + 1 : i + 3]
        args = args[:i] + args[i + 3 :]
    finish = None
    if "--finish-s" in args:
        i = args.index("--finish-s")
        finish = (float(args[i + 1]), args[i + 2])
        args = args[:i] + args[i + 3 :]
    model, route_file, out = args
    doc, rest = read_glb(model)
    route = json.load(open(route_file))
    pts = [[round(p["position"][0], 4), round(p["position"][2], 4), round(-p["position"][1], 4)] for p in route["route"]]
    doc["nodes"] = [n for n in doc["nodes"] if n.get("name") != "SKATE_ROUTE"]
    doc["nodes"].append({"name": "SKATE_ROUTE", "extras": {"route": pts, "length_m": route.get("mapped_route_length_m"), "note": "the path he rides, glTF axes, riding order"}})
    doc["scenes"][doc.get("scene", 0)]["nodes"].append(len(doc["nodes"]) - 1)
    if finish:
        dist, name = finish
        acc = 0.0
        for a, b in zip(pts, pts[1:]):
            seg = ((b[0] - a[0]) ** 2 + (b[2] - a[2]) ** 2) ** 0.5
            if acc + seg >= dist:
                t = (dist - acc) / seg
                node = next(n for n in doc["nodes"] if n.get("name") == name)
                node["translation"] = [round(a[i] + (b[i] - a[i]) * t, 4) for i in range(3)]
                print(f"{name} moved to {node['translation']} ({dist} m along the route)")
                break
            acc += seg
        else:
            raise SystemExit("--finish-s is past the end of the route")
    size = write_glb(out, doc, rest)
    print(f"{out}: {size / 1024 / 1024:.1f} MB, route of {len(pts)} points, {route.get('mapped_route_length_m', 0):.0f} m")
    if collision:
        shutil.copyfile(collision[0], collision[1])
        print(f"{collision[1]}: copied")


if __name__ == "__main__":
    main()
