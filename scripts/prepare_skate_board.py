"""Makes a drawn skateboard for the game (public/hue/board.glb) from a detailed model, in Blender's command line (it does not touch a Blender you have open):

    /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/prepare_skate_board.py -- <skateboard.obj or .fbx> <board.glb> [length in metres, default 0.2]

What it does: drops the parts too small to see at the board's size in the game (bolts, nuts, small tubes), cuts what is left down to a few thousand triangles, gives it plain
materials (deck, grip tape, metal, base plates, wheels), joins the body into one mesh and keeps the four wheels as their own meshes named WHEEL_1 to WHEEL_4, each with its origin at its
centre so the game can spin it about its axle. The board ends up `length` long (the deck), its length along +x, standing on the ground (the wheels' bottoms at y = 0), centred on x and z.
It prints DECK_TOP: the height of the flat of the deck above the ground, which is what his feet stand on (SKATE.deck in src/config.ts).
"""
import sys

import bmesh
import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1 :]
src, dst = argv[0], argv[1]
LENGTH = float(argv[2]) if len(argv) > 2 else 0.2

bpy.ops.wm.read_factory_settings(use_empty=True)
if src.lower().endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=src)
else:
    bpy.ops.wm.obj_import(filepath=src)
objs = [o for o in bpy.data.objects if o.type == "MESH"]
for o in objs:  # bake each part's transform into its mesh, so everything is in one space
    o.data.transform(o.matrix_world)
    o.matrix_world = mathutils.Matrix.Identity(4)


def bounds(o):
    # from the vertices (every part's transform is baked into its mesh), because an object's bound_box is not refreshed after its mesh is changed in place
    vs = [v.co for v in o.data.vertices]
    return [min(v[i] for v in vs) for i in range(3)], [max(v[i] for v in vs) for i in range(3)]


def size(o):
    mn, mx = bounds(o)
    return [mx[i] - mn[i] for i in range(3)]


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


deck = max(objs, key=lambda o: max(size(o)))
span = max(size(deck))
wheels = sorted([o for o in objs if o.name.startswith("ChamferCyl")], key=lambda o: (round(bounds(o)[0][0], 2), bounds(o)[0][1]))
assert len(wheels) == 4, f"expected 4 wheels (ChamferCyl*), found {len(wheels)}"
keep = [o for o in objs if o is deck or o in wheels or max(size(o)) >= 0.06 * span]
for o in objs:
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)


def material(name, colour, metal=0.0, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*colour, 1.0)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    return m


MAT = {
    "deck": material("deck", (0.62, 0.40, 0.20)),
    "grip": material("grip", (0.04, 0.04, 0.045), rough=0.95),
    "metal": material("metal", (0.66, 0.68, 0.72), metal=0.85, rough=0.35),
    "plate": material("plate", (0.16, 0.16, 0.18), metal=0.3, rough=0.5),
    "wheel": material("wheel", (0.95, 0.93, 0.88), rough=0.45),
}


def decimate(o, target):
    t = tris(o)
    if t <= target:
        return
    bpy.context.view_layer.objects.active = o
    mod = o.modifiers.new("dec", "DECIMATE")
    mod.ratio = target / t
    bpy.ops.object.modifier_apply(modifier=mod.name)


def only(o, mat):
    o.data.materials.clear()
    o.data.materials.append(MAT[mat])
    for p in o.data.polygons:
        p.material_index = 0


body = []
for o in keep:
    before = tris(o)
    if o in wheels:
        decimate(o, 280)
        only(o, "wheel")
    elif o is deck:
        decimate(o, 500)
        o.data.materials.clear()
        o.data.materials.append(MAT["deck"])
        o.data.materials.append(MAT["grip"])
        for p in o.data.polygons:  # the upward-facing skin of the deck is grip tape
            p.material_index = 1 if p.normal.z > 0.5 else 0
        body.append(o)
    else:
        decimate(o, 90)
        only(o, "plate" if o.name.startswith(("Box", "ChamferBox")) else "metal")
        body.append(o)
    print("PART", o.name, before, "->", tris(o))

# one body mesh (the deck first, so its two materials come first)
bpy.ops.object.select_all(action="DESELECT")
for o in body:
    o.select_set(True)
bpy.context.view_layer.objects.active = deck
bpy.ops.object.join()
deck.name = "BOARD_body"

# put the board where the game wants it: length along x, standing on y = 0, centred; `length` long
all_objs = [deck] + wheels
mn = [min(bounds(o)[0][i] for o in all_objs) for i in range(3)]
mx = [max(bounds(o)[1][i] for o in all_objs) for i in range(3)]
dmn, dmx = bounds(deck)
axis = max(range(3), key=lambda i: dmx[i] - dmn[i])
assert axis == 0, "the deck's length is expected along the model's x"
centre = [(dmn[0] + dmx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]]  # x of the deck's middle, y mid-width, z the wheels' bottoms
k = LENGTH / (dmx[0] - dmn[0])
M = mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation(-mathutils.Vector(centre))
for o in all_objs:
    o.data.transform(M)

# DECK_TOP: the highest point of the deck's flat middle third, above the ground
zs = [v.co.z for v in deck.data.vertices if abs(v.co.x) < LENGTH * 0.3 and v.co.z > 0.01]  # (the trucks and wheels are under 0.01 m up at the middle)
print("DECK_TOP", round(max(zs), 4), "metres above the ground")

for w in wheels:  # each wheel's origin at its centre, so spinning it turns it about its axle
    c = sum((v.co for v in w.data.vertices), mathutils.Vector()) / len(w.data.vertices)
    w.data.transform(mathutils.Matrix.Translation(-c))
    w.location = c
for i, w in enumerate(wheels, 1):
    w.name = f"WHEEL_{i}"

total = sum(tris(o) for o in all_objs)
print("BOARD triangles", total, "| meshes", len(all_objs), "| size (x, y, z)", [round(v, 4) for v in size(deck)], "| wheels at", [[round(v, 3) for v in w.location] for w in wheels])
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, export_materials="EXPORT", export_yup=True, export_animations=False, use_selection=True)
print("WROTE", dst)
