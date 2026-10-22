# hue's room

A small 3D platformer for the web and iOS: Hue (0.457 m tall) climbs, jumps, bounces and kicks
things around a level, collecting its coins against the clock. Three levels so far (his room, 11
coins; Ludlow Street, 17; the deli, 13); levels are data, see [Levels](#levels). The game's name
is one line, `src/brand.ts`. Agents: read [AGENTS.md](AGENTS.md) first.

Next.js 16 · React 19 · three 0.182 · @react-three/fiber 9 · drei 10 · @react-three/rapier 2 ·
@react-three/postprocessing · zustand · Tailwind 4.

## Run

```bash
npm install
npm run dev            # http://localhost:3000
```

URL flags: `?debug` (Rapier wireframes, standable tops with heights, climb probe, fps meter,
console table of surfaces) · `?test` (scripted-test hooks on `window.__hue`, no debug visuals).

## Controls

WASD / arrows move (camera-relative), Shift runs, Space jumps, R restarts, Esc / P pause, mouse
drag peeks. On touch devices: joystick (push past 70% to run), jump button, drag the right half
to peek, pause button. Xbox/standard gamepad: left stick moves (past 70% or RB/RT = run), A jumps
and confirms menus, right stick peeks, Menu pauses, View restarts.

## Levels

A level is a room model plus one entry in [`src/levels.ts`](src/levels.ts): `id`, `number`, `name`,
`mode` (`run` = timed, `explore` = no clock), the `room` URL and the `spawn` node. Level 1 is
`home`. `?level=<id>` plays another one; an unknown id plays the first.

The model's nodes are the level (Blender names; GLTFLoader's sanitised ones are matched through
`userData.name`):

| Node | | What it does |
|---|---|---|
| `COL_*` boxes | required | Fixed colliders, hidden. User data: `standable: false` (can't be climbed), `retired` (skipped), `bounce_pad` + `bounce_apex_m` (trampoline), `ladder` + `bottom_z_blender`, `top_z_blender`, `approach_from_blender_xy`, `exit_dir_blender_xy` |
| `COL_Boundary south` | required | Its inner face is the open wall: the camera's plane |
| `COIN_01`, `COIN_02`, … | required | One node per coin. The level's coin total is however many there are |
| the `spawn` node | required | Where Hue starts; `facing_xy` (Blender XY) gives the facing |
| `BOOK_KICK_01`, … | optional | Kickable books (`mass_kg`, `friction`, `restitution` in user data) |
| `COL_Spray can*` + `ROOM_static` | optional | Pushable cans cut out of the room mesh |
| `Beanbag \| couch brown` | optional | Squashes on bounces; its hull replaces `COL_Beanbag` |

### Level design budget (Hue is 0.457 m tall; numbers come from `src/config.ts`)

| | |
|---|---|
| Speed | walks 0.55 m/s, runs 0.80 m/s |
| Body | capsule 0.12 m wide, 0.46 m tall: gaps under about 0.13 m wide are impassable, ceilings need 0.47 m clear |
| Steps | walks up anything up to 0.10 m without jumping |
| Jump | rises about 0.60 m, hangs about 0.95 s, reaches about 0.65 m forward |
| Ledge climb | flat, standable tops 0.10 to 0.55 m above his feet, with 0.47 m of head-room above them |
| Taller than 0.55 m | needs a jump chain (platforms about 0.5 m apart vertically and under 0.65 m across) or a ladder |
| Drops | over 0.2 m is a hop landing (brief control lock); over 0.9 m is a roll (longer lock) |
| Coins | picked up within about 0.14 m of the body; a jump reaches about 0.9 m above a standing surface |

### Skate levels

A level with `mode: "skate"` is ridden on a skateboard along one **lane**, with the camera behind him (its own camera, `src/skate/SkateCamera.tsx`, instead of the wall-plane one): he is dead centre
with his back to us, looking down the road, and he only ever goes forward. The lane is the level's **route** (a `SKATE_ROUTE` node: the street's own line, bends and hills included), or, for a
level without one, a straight line from the spawn node in the direction it faces (`facing_xy`). Nothing steers him sideways, so everything he meets (obstacles, rails, coins, the finish) sits on
the lane. The level ends at a finish line, not at the last coin: its coins are picked up on the way and whatever he collected is banked.

**Controls.** Left hand, the left stick or **W / S**: up pushes (it speeds him up, to 2.7 m/s), down brakes; sideways does nothing. Right hand, the right stick or **the arrow keys**: the tricks.
Keyboard: **Up** ollie, **Left** kickflip, **Right** heelflip, **Down** shuvit (Space is also an ollie). On the ground an arrow pops and does the trick in one; tapped in the air it adds the trick to the
ollie he is in. A kickflip or heelflip rolls the board once along its length under him (the other way for the heelflip), a shuvit spins it half a turn, and it finishes flat. Landing before it is done
just snaps it flat: nothing is lost. Phone and pad: flick the right stick back and forward again in one quick movement (within about 0.45 s) for an ollie, leaning it left on the way for a kickflip or
right for a heelflip; on a pad X is a kickflip, B a heelflip, Y a shuvit, and A pops. On a rail he rides to the end by himself; any pop or trick takes him off early. Running into something tall costs
him most of his speed and nothing else (there is no failing).

`levels.ts` gives the level `skate: { finish: "<node>", route?: "<node>", camera?: {...} }`; the code is in `src/skate/` (`SkateMover.ts` the rider, `lane.ts` the path, `SkateCamera.tsx`,
`rails.ts`, `flick.ts`, `SkateScene.tsx` the board and the finish) and every number is in `SKATE` in `src/config.ts` (`SKATE.cam` for the camera).

| Node | | What it does |
|---|---|---|
| `COL_*` boxes | required | As in any level. Obstacles are ordinary colliders; a rail's supports too. A street whose collision is meshes (`skate.collision`: a second glb of `COL_*` meshes) gets mesh colliders |
| `SKATE_ROUTE` | optional | An empty whose `route` user data is a list of `[x, y, z]` points (the model's world axes, y up) in riding order: the path he rides and the camera follows. Points a metre or two apart are plenty; the spawn must be on it. Without it the lane is straight from the spawn |
| `RAIL_01`, `RAIL_02`, … | optional | A hidden box per rail: its **long side is the rail** and its **top face is the line he grinds along** (it may slope). It has no collider of its own: the visible rail is ordinary geometry, and under it a `COL_*` ledge or its supports must stop a board that rolls into it (top about 3 cm under the grind line) |
| `COIN_nn` | required | As in any level. Over an obstacle, in an arc; above a rail, in a line (numbers below). The coin disc faces down the lane |
| the finish node (`skate.finish`) | required | The run is won the first time he has ridden past it along the lane |
| the spawn node | required | As in any level; he starts on the board, standing still, facing along the lane |

**Numbers** (his size; the board is about 0.2 m long). Rolling speed 0.9 (coasting) to 2.7 m/s. An ollie rises about **0.34 m** and stays up about 0.7 s, travelling 1.4 to 1.9 m
at 2 to 2.7 m/s. He steps up anything under 0.10 m without a jump, so an obstacle is **0.11 m or taller**; **0.22 m** needs a well-timed pop; over about 0.30 m is out of reach.
Rail lines work from **0.18 to 0.30 m** up (the board is caught from 6 cm under to 10 cm over the line, coming down, not rising faster than 0.6 m/s). A kicker's slope may be up to
45 degrees; it throws him up the way he was rising when he leaves the lip. The camera stands 1.5 m behind him (2 m at full speed) and 0.7 m up, and looks 3 m ahead.

**Coins.** A coin is picked up within 0.14 m of his body, which spans 0.06 to 0.40 m above his feet, so on the ground he reaches a coin up to 0.54 m high. A coin meant to need a jump
or a grind is centred **0.58 m or more** above the ground (or above the rail line he is on). Over an obstacle: an arc at least as long as the obstacle plus 0.3 m, 0.58 m up at the
ends and about 0.16 m higher in the middle. Above a rail: a line of coins 0.47 m over the grind line, one every 0.25 m. After a kicker: along the flight, 0.38 m over his feet.
`scripts/build_skate_yard.py` has these as `arc_coins`, `rail_coins` and `air_coins`.

**A street with no gameplay of its own** (a model that is only the street, with a route) gets it laid along the route from a seed (`skate.course: { seed }`, `src/skate/course.ts`): kerbs and barriers
(0.15 to 0.22 m), double kerbs, grind rails on a ledge (1.2 to 2.2 m long, 0.20 to 0.26 m up), kickers, and the coins over every one of them by the rules above, 9 to 15 m apart, never the
same kind twice in a row, the same on every device. The pieces are drawn as plain boxes and the coins are added as `COIN_nnn` nodes, so nothing else in the game needs to know. `tests/skate-maps.mjs`
rides both street levels with a scripted rider and checks every rail is ground and every coin picked up.

**Draw distance.** A long street is drawn only near him (`skate.view`, defaults in `SKATE.view`: 75 m ahead, 15 m behind): the camera's far plane stops there, the last stretch fades into haze of the
horizon's colour, and the model's chunks (a street model comes in blocks of buildings) outside the window are switched off, placed once by the stretch of the route their box covers. `node tests/dev/perf-skate.mjs <level>` counts a phone
frame (Ludlow, 380 m: about 190 draw calls and 155K to 185K triangles; Broome: about 175 calls and 190K to 205K). To use a street model, `scripts/prepare_skate_level.py` adds its route to the glb (the geometry is not touched).

**Hue on the board.** The board is a model (`public/hue/board.glb`, 3K triangles: a deck, trucks and four wheels that turn with his speed), made from a detailed skateboard model by
`scripts/prepare_skate_board.py` (Blender's command line; it also prints how high the deck is above the ground, which is `SKATE.deck`). He rides in two Mixamo clips, `skate_push` (while the stick
pushes) and `skate_ride` (otherwise, and in the air and on rails); `scripts/convert-mixamo-clip.mjs` turns a Mixamo FBX into a clip glb in the format the others have.

**The test yard.** `?level=skate-yard` (not offered to players: `live: false`) is a straight lane with a kerb, a barrier, a double kerb, a kicker and two rails, 37 coins and a finish,
built by `python3 scripts/build_skate_yard.py` with no Blender. It exists to build and test the skate gameplay before any real level model, and is the worked example of the table above.

Still specific to level 1, so the next level will need its own: the seated start (Hue stands up
from a chair; a street has no chair), the camera zones in `CAMERA` (beanbag corner, ladder), the
lighting rig in `Lighting.tsx`, the win line ("hue made it outside"), and the single best-time key.

## Tests

All need the dev server on port 3100 (`npx next dev -p 3100`) and use the Playwright Chromium
in `~/Library/Caches/ms-playwright`.

```bash
npm run test:routes    # every route in prompt 1.5, via teleport + scripted input (18 legs)
npm run test:qa        # 30 end-to-end checks: intro lock, timer, keyboard play, pause, restart,
                       # win + best time, pose monitor, audio, touch UI, console errors
npm run test:street    # level 2: the level checks and its 27 route legs
npm run test:skate     # the skateboard: the ollie flick and the rail geometry (no browser), then the test yard in virtual time: pushing and braking, the ollie
                       # at 32/64/128 fps, the right-stick path, bumps, the kicker, grinding a rail and popping off it, the coins, the finish line
npm run test:deli      # level 3: the camera (never inside a fixture; round the middle shelf; and tests/camera-audit.mjs: Hue in sight
                       # on every frame of the recorded route and at every spot he can reach) and the ladders
npm run test:flow      # the win screen's keys, falling out of the world, the deli's wall height
npm run test:menu      # the home menu: the plain address loads no level (no canvas, no model), the keyboard and
                       # pad walk it, and choosing a location loads ?level=<id>
node tests/feet.mjs    # his drawn body stands on what is drawn at every spot he can reach (the deli): compared with a real mesh raycast
node tests/perf.mjs    # what a phone frame costs per level: draw calls, triangles on screen, GPU memory (the numbers to check a new model against)
npm run test:reach     # virtual time: every level's recorded route collects every coin and wins;
                       # a jump is the same height at 32, 64, 128 and 256 fps
URL="http://localhost:3200/huesroom/?test" npm run test:qa   # against a sub-path build
```

**Virtual time** (`tests/vt.mjs`) runs the real game frame by frame at a fixed step, about five
times faster than real time and identical every run. `tests/explore.mjs` uses it to search every
level for what Hue can reach (and any hole in the level) with the real physics, and
`tests/reach-tour.mjs` turns what it found into the route that `test:reach` replays
(`tests/reach/<level>.json`). Run those two again when a level's model changes.

## Where things are

| | |
|---|---|
| `src/levels.ts`, `src/useLevel.ts` | the level list (room model, spawn node, name, mode) and the hooks that read the current level |
| `src/config.ts` | every tunable (movement, climb, camera, coins, books, bloom) and asset URLs |
| `src/clips.ts` | animation clean-up (Hips axes, seat/rise alignment, climb clip turned around) |
| `src/useHueController.ts` | character controller: walk/run, jump, climb, ladder, bounce, landings, book kicks |
| `src/CameraRig.tsx` | open-wall-plane camera (z locked), blocked-view slide, peek |
| `src/quality.ts` | desktop effect tiers (2 everything, 1 no ambient shading, 0 just the tone mapping and colour grade); the frame-rate monitor in `Game.tsx` steps them down before it lowers the resolution; `?quality=0|1|2` forces one |
| `src/camera/sight.ts` | the camera's sight map (levels.ts `camera.sight`; the deli): the room's solid meshes in a grid, so the camera can tell it sees Hue and, if not, find the nearest spot that does. `tests/dev/` has the scratch tools used to tune it |
| `src/Room.tsx` | room, colliders from `COL_*` (retired ones skipped), beanbag hull, squash |
| `src/skate/` | the skateboard levels: the rider (`SkateMover.ts`), the right-stick flick, the rails, the board and the finish line (see "Skate levels") |
| `src/Coins.tsx`, `src/fx/` | coins, glints, smoke, coin reflection map, instanced sprites |
| `src/Books.tsx` | kickable books |
| `src/Hud.tsx`, `src/ui/`, `src/ShareCard.tsx` | HUD, menus, share card. **Restyle in `ui/theme.ts` + `ShareCard.tsx`** |
| `src/audio/` | sound (clips in `public/audio/`, synth fallback, generated music), mute toggles |
| `scripts/` | clip analysis tools used to derive the numbers above |

Deploying: see [DEPLOY.md](DEPLOY.md).
