#!/usr/bin/env python3
"""Builds the skateboard test yard: public/levels/skate-yard/room.glb (run from game/: python3 scripts/build_skate_yard.py).

A small flat lot with the things a skateboard level needs, so the skate gameplay can be built and tested before any real level model exists: low obstacles with a
coin arc over each, a kicker ramp with coins in the air after it, rails with coins above them, a finish line. It is also a worked example of what a skate level's
model has to contain (README > "Skate levels"). Plain python, no Blender: it writes the glTF itself.

The lane runs straight down the screen: he rolls toward -z (away from the camera, which rides behind him), so a point `u` metres along the lane is at world z = -u, and the
lane's width is x. Obstacles span the lane; everything else is just in it.
"""
import json
import math
import os
import struct

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "levels", "skate-yard", "room.glb")

# ---------------------------------------------------------------------------------------------------------------- tiny glTF writer


class Gltf:
    def __init__(self):
        self.nodes, self.meshes, self.materials, self.accessors, self.views = [], [], [], [], []
        self.bin = bytearray()
        self._mats, self._meshes = {}, {}

    def material(self, name, color, rough=0.85, metal=0.0):
        if name not in self._mats:
            r, g, b = (int(color[i : i + 2], 16) / 255.0 for i in (1, 3, 5))
            # glTF colours are linear.
            lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
            self.materials.append({"name": name, "pbrMetallicRoughness": {"baseColorFactor": lin + [1.0], "metallicFactor": metal, "roughnessFactor": rough}})
            self._mats[name] = len(self.materials) - 1
        return self._mats[name]

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        start = len(self.bin)
        self.bin += data
        v = {"buffer": 0, "byteOffset": start, "byteLength": len(data)}
        if target:
            v["target"] = target
        self.views.append(v)
        return len(self.views) - 1

    def mesh(self, key, positions, normals, indices, material):
        if key in self._meshes:
            return self._meshes[key]
        pos = b"".join(struct.pack("<3f", *p) for p in positions)
        nor = b"".join(struct.pack("<3f", *n) for n in normals)
        idx = b"".join(struct.pack("<H", i) for i in indices)
        xs, ys, zs = zip(*positions)
        a = []
        for data, target, ctype, count, typ, extra in (
            (pos, 34962, 5126, len(positions), "VEC3", {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}),
            (nor, 34962, 5126, len(normals), "VEC3", {}),
            (idx, 34963, 5123, len(indices), "SCALAR", {}),
        ):
            self.accessors.append({"bufferView": self._view(data, target), "componentType": ctype, "count": count, "type": typ, **extra})
            a.append(len(self.accessors) - 1)
        self.meshes.append({"name": key, "primitives": [{"attributes": {"POSITION": a[0], "NORMAL": a[1]}, "indices": a[2], "material": material}]})
        self._meshes[key] = len(self.meshes) - 1
        return self._meshes[key]

    def node(self, name, mesh=None, t=(0, 0, 0), q=(0, 0, 0, 1), s=(1, 1, 1), extras=None):
        n = {"name": name, "translation": list(t)}
        if any(abs(a - b) > 1e-9 for a, b in zip(q, (0, 0, 0, 1))):
            n["rotation"] = list(q)
        if tuple(s) != (1, 1, 1):
            n["scale"] = list(s)
        if mesh is not None:
            n["mesh"] = mesh
        if extras:
            n["extras"] = extras
        self.nodes.append(n)
        return len(self.nodes) - 1

    def write(self, path):
        doc = {
            "asset": {"version": "2.0", "generator": "scripts/build_skate_yard.py"},
            "scene": 0,
            "scenes": [{"nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "accessors": self.accessors,
            "bufferViews": self.views,
            "buffers": [{"byteLength": len(self.bin)}],
        }
        js = json.dumps(doc, separators=(",", ":")).encode()
        js += b" " * (-len(js) % 4)
        bn = bytes(self.bin) + b"\0" * (-len(self.bin) % 4)
        total = 12 + 8 + len(js) + 8 + len(bn)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(struct.pack("<4sII", b"glTF", 2, total))
            f.write(struct.pack("<I4s", len(js), b"JSON") + js)
            f.write(struct.pack("<I4s", len(bn), b"BIN\0") + bn)
        return total


def unit_box():
    faces = [((1, 0, 0), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]), ((-1, 0, 0), [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)]),
             ((0, 1, 0), [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)]), ((0, -1, 0), [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)]),
             ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]), ((0, 0, -1), [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)])]
    pos, nor, idx = [], [], []
    for n, vs in faces:
        base = len(pos)
        pos += [(x / 2, y / 2, z / 2) for x, y, z in vs]
        nor += [n] * 4
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
    return pos, nor, idx


def cylinder(axis, r, h, seg=20):
    """A cylinder of radius r and length h centred on the origin, its axis along 'x' or 'z'."""
    pos, nor, idx = [], [], []

    def p(a, d):  # a point on the rim at angle a, d along the axis
        c, s = math.cos(a) * r, math.sin(a) * r
        return (d, c, s) if axis == "x" else (c, s, d)

    def n(v):
        return (v, 0, 0) if axis == "x" else (0, 0, v)

    for i in range(seg):
        a0, a1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        base = len(pos)
        for a, d in ((a0, -h / 2), (a1, -h / 2), (a1, h / 2), (a0, h / 2)):
            pos.append(p(a, d))
            c, s = math.cos(a), math.sin(a)
            nor.append((0, c, s) if axis == "x" else (c, s, 0))
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
        for sign in (-1, 1):
            base = len(pos)
            pos += [n(sign * h / 2), p(a0, sign * h / 2), p(a1, sign * h / 2)]
            nor += [n(sign)] * 3
            idx += [base, base + 1, base + 2] if sign > 0 else [base, base + 2, base + 1]
    return pos, nor, idx


def wedge(length, height, depth):
    """A ramp: the triangle (0,0) (length,0) (length,height) in x-y, `depth` deep in z, centred on z."""
    d = depth / 2
    tri = [(0, 0), (length, 0), (length, height)]
    pos, nor, idx = [], [], []

    def quad(vs, n):
        base = len(pos)
        pos.extend(vs)
        nor.extend([n] * 4)
        idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    sl = math.hypot(length, height)
    for z, n in ((d, (0, 0, 1)), (-d, (0, 0, -1))):
        base = len(pos)
        pos.extend([(x, y, z) for x, y in tri])
        nor.extend([n] * 3)
        idx.extend([base, base + 1, base + 2] if z > 0 else [base, base + 2, base + 1])
    quad([(0, 0, -d), (length, 0, -d), (length, 0, d), (0, 0, d)], (0, -1, 0))
    quad([(length, 0, -d), (length, height, -d), (length, height, d), (length, 0, d)], (1, 0, 0))
    quad([(0, 0, -d), (0, 0, d), (length, height, d), (length, height, -d)], (-height / sl, length / sl, 0))
    return pos, nor, idx


def qz(angle):
    return (0, 0, math.sin(angle / 2), math.cos(angle / 2))


def qy(angle):
    return (0, math.sin(angle / 2), 0, math.cos(angle / 2))


def qx(angle):
    return (math.sin(angle / 2), 0, 0, math.cos(angle / 2))


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)


# ---------------------------------------------------------------------------------------------------------------- the yard

G = Gltf()
BOX = unit_box()
COLOURS = {
    "ground": "#dcdcd8", "wall": "#f2f1ec", "stripe": "#f4cf5b", "kerb": "#ef8a3d", "barrier": "#4a7fe0", "ramp": "#7a6ae0", "rail": "#9aa0a8", "post": "#6e737a",
    "finish_a": "#16161a", "finish_b": "#f6f6f2", "coin": "#c9ccd4", "hidden": "#ff00ff",
}


def W(u, y=0.0, v=0.0):
    """Lane coordinates (u along the lane, v across it, y up) to the model's world axes."""
    return (v, y, -u)


def box_visual(name, centre_uyv, size_uyv, colour, rough=0.85, q=(0, 0, 0, 1)):
    """A box centred at lane coordinates (u, y, v), sized (along the lane, up, across it)."""
    m = G.mesh(f"box:{colour}", *BOX, G.material(colour, COLOURS[colour], rough))
    u, y, v = centre_uyv
    su, sy, sv = size_uyv
    return G.node(name, m, W(u, y, v), q, (sv, sy, su))


def collider(name, centre_uyv, size_uyv, q=(0, 0, 0, 1), extras=None):
    m = G.mesh("box:hidden", *BOX, G.material("hidden", COLOURS["hidden"]))
    u, y, v = centre_uyv
    su, sy, sv = size_uyv
    return G.node(name, m, W(u, y, v), q, (sv, sy, su), {"collider": "box", "body": "fixed", **(extras or {})})


U0, U1 = -8.0, 24.0           # the yard's ground, along the lane
HALF = 2.0                    # half its width
SPAN = 2.2                    # obstacles span the lane
LANE_START = 0.5              # where he starts

# Ground, side walls, the far wall, and painted dashes down the middle and the sides: the dashes streaming past are most of what shows how fast he is going.
box_visual("Ground", ((U0 + U1) / 2, -0.15, 0), (U1 - U0, 0.3, 2 * HALF), "ground")
collider("COL_Ground", ((U0 + U1) / 2, -0.15, 0), (U1 - U0, 0.3, 2 * HALF))
for side in (-1, 1):
    box_visual(f"Side wall {side}", ((U0 + U1) / 2, 0.6, side * (HALF + 0.05)), (U1 - U0, 1.2, 0.1), "wall")
box_visual("Far wall", (U1, 1.5, 0), (0.1, 3.0, 2 * HALF + 0.2), "wall")
box_visual("Back wall", (U0, 1.5, 0), (0.1, 3.0, 2 * HALF + 0.2), "wall")
for i in range(int((U1 - U0) / 1.5)):
    box_visual(f"Dash {i}", (U0 + 0.75 + i * 1.5, 0.002, 0), (0.6, 0.004, 0.07), "stripe", rough=0.9)
    for side in (-1, 1):
        box_visual(f"Edge dash {i} {side}", (U0 + 0.75 + i * 1.5, 0.002, side * 1.4), (0.6, 0.004, 0.05), "stripe", rough=0.9)


def block(name, u0, u1, h, colour="kerb"):
    c = ((u0 + u1) / 2, h / 2, 0)
    box_visual(name, c, (u1 - u0, h, SPAN), colour)
    collider(f"COL_{name}", c, (u1 - u0, h, SPAN))


# ---- obstacles. Each has a coin arc over it (see arc_coins).
OBSTACLES = []  # (centre u, top height, length along the lane)


def obstacle(name, u0, u1, h, colour="kerb"):
    block(name, u0, u1, h, colour)
    OBSTACLES.append(((u0 + u1) / 2, h, u1 - u0))


obstacle("Kerb", 3.1, 3.6, 0.13, "kerb")
obstacle("Barrier", 11.4, 11.8, 0.22, "barrier")
obstacle("Double kerb a", 13.7, 14.0, 0.12, "kerb")
obstacle("Double kerb b", 14.6, 14.9, 0.12, "kerb")

# ---- the kicker: a ramp up to a lip, then air.
RAMP_U0, RAMP_U1, RAMP_H = 5.2, 5.8, 0.30
RAMP_W = 1.8
ang = math.atan2(RAMP_H, RAMP_U1 - RAMP_U0)
slope_len = math.hypot(RAMP_U1 - RAMP_U0, RAMP_H)
thick = 0.06
mid = ((RAMP_U0 + RAMP_U1) / 2, RAMP_H / 2)
normal = (-math.sin(ang), math.cos(ang))  # up out of the slope, in (u, y)
# The wedge's own x runs along the lane (a quarter turn about y: local +x is world -z), its extrusion across it.
G.node("Kicker", G.mesh("wedge", *wedge(RAMP_U1 - RAMP_U0, RAMP_H, RAMP_W), G.material("ramp", COLOURS["ramp"], 0.8)), W(RAMP_U0), qy(math.pi / 2))
collider("COL_Kicker", (mid[0] - normal[0] * thick / 2, mid[1] - normal[1] * thick / 2, 0), (slope_len, thick, RAMP_W), qx(ang))  # a slab whose length runs along the lane (world z), tilted up toward -z

# ---- rails: a pipe on posts over a low ledge he bumps into on the ground and grinds from the air. RAIL_nn is the hidden grind line (README > Skate levels).
RAILS = []  # (u0, u1, top height)


def rail(u0, u1, top):
    n = len(RAILS) + 1
    RAILS.append((u0, u1, top))
    cu = (u0 + u1) / 2
    pipe = G.mesh("pipe", *cylinder("z", 0.012, 1.0), G.material("rail", COLOURS["rail"], 0.3, 0.8))
    G.node(f"Rail {n} pipe", pipe, W(cu, top - 0.012), s=(1, 1, u1 - u0))
    for u in (u0 + 0.06, u1 - 0.06):
        box_visual(f"Rail {n} post", (u, (top - 0.024) / 2, 0), (0.03, top - 0.024, 0.03), "post")
    # The ledge under the pipe stops a board that rolls into it; its top is a hair below the grind line, so a landing on it is caught by the rail.
    collider(f"COL_Rail {n} ledge", (cu, (top - 0.03) / 2, 0), (u1 - u0, top - 0.03, 0.04))
    G.node(f"RAIL_{n:02d}", G.mesh("box:hidden", *BOX, G.material("hidden", COLOURS["hidden"])), W(cu, top - 0.01), s=(0.03, 0.02, u1 - u0), extras={"src": "skate-yard"})


rail(8.2, 9.6, 0.20)
rail(16.2, 17.6, 0.24)

# ---- the finish: a gate, and the node the game reads.
FINISH_U = 19.2
for side in (-1, 1):
    box_visual(f"Finish post {side}", (FINISH_U, 0.5, side * 1.0), (0.06, 1.0, 0.06), "finish_a")
box_visual("Finish banner", (FINISH_U, 1.0, 0), (0.06, 0.16, 2.06), "finish_b")
G.node("SKATE_FINISH", None, W(FINISH_U), extras={"note": "the run ends when he has ridden past this node along the lane"})
G.node("SPAWN_Hue_start", None, W(LANE_START), extras={"facing_xy": [0, 1], "note": "he starts on the board, standing still, facing along the lane (Blender +Y is the model's -z)"})

# ---------------------------------------------------------------------------------------------------------------- coins

# Reach (at his size): a coin is picked up within 0.14 m of his body, which spans 0.06 to 0.40 m above his feet. Standing on the ground he reaches a coin up to 0.54 m high,
# so a coin that is meant to need a jump or a grind is centred at 0.58 m or more above the ground the board rolls on.
COINS = []  # (u, y)


def arc_coins(u, top, length, n=5, spacing=0.2):
    """A coin arc over an obstacle: centred over it, at least 0.58 m up, a little higher in the middle (an ollie's apex), wide enough that its ends are above the edges."""
    n = max(n, int(math.ceil((length + 0.3) / spacing)) | 1)
    for i in range(n):
        t = (i - (n - 1) / 2) / ((n - 1) / 2)
        COINS.append((u + (i - (n - 1) / 2) * spacing, max(0.58, top + 0.45) + 0.16 * (1 - t * t)))


def rail_coins(u0, u1, top, spacing=0.25):
    """A line of coins above a rail, high enough that only a board on the rail (or in the air) picks them up."""
    n = int((u1 - u0 - 0.2) / spacing) + 1
    start = (u0 + u1) / 2 - (n - 1) * spacing / 2
    for i in range(n):
        COINS.append((start + i * spacing, top + 0.47))


def air_coins(lip_u, lip_h, speed=2.0, n=5, step=0.2):
    """Coins along the flight off a kicker's lip at `speed` (the arc he follows leaving it), 0.38 m over his feet."""
    vy = (lip_h / (RAMP_U1 - RAMP_U0)) * speed
    for i in range(1, n + 1):
        t = i * step / speed
        feet = lip_h + vy * t - 0.5 * 5.3 * t * t
        COINS.append((lip_u + i * step, feet + 0.38))


for u, top, length in OBSTACLES:
    if 13 < u < 15:
        continue  # the double kerb gets one long arc below
    arc_coins(u, top, length)
arc_coins(14.3, 0.12, 1.2, n=9, spacing=0.2)
air_coins(RAMP_U1, RAMP_H)
for u0, u1, top in RAILS:
    rail_coins(u0, u1, top)
for u in (1.3, 1.6, 1.9):  # a few on the flat to push toward
    COINS.append((u, 0.2))

coin_mesh = G.mesh("coin", *cylinder("z", 0.065, 0.02, 24), G.material("coin", COLOURS["coin"], 0.12, 1.0))  # faces down the lane: the camera sees every coin face on
for i, (u, y) in enumerate(sorted(COINS), 1):
    G.node(f"COIN_{i:02d}", coin_mesh, W(u, y), extras={"collectible": True, "coin_id": i})

size = G.write(OUT)
print(f"wrote {os.path.relpath(OUT)}: {size / 1024:.0f} KB, {len(G.nodes)} nodes, {len(COINS)} coins, {len(RAILS)} rails, {len(OBSTACLES)} obstacles")
