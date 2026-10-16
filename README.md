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
npm run test:deli      # level 3: the camera spots and the ladders
npm run test:flow      # the win screen's keys, falling out of the world, the deli's wall height
npm run test:menu      # the home menu: the plain address loads no level (no canvas, no model), the keyboard and
                       # pad walk it, and choosing a location loads ?level=<id>
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
| `src/Room.tsx` | room, colliders from `COL_*` (retired ones skipped), beanbag hull, squash |
| `src/Coins.tsx`, `src/fx/` | coins, glints, smoke, coin reflection map, instanced sprites |
| `src/Books.tsx` | kickable books |
| `src/Hud.tsx`, `src/ui/`, `src/ShareCard.tsx` | HUD, menus, share card. **Restyle in `ui/theme.ts` + `ShareCard.tsx`** |
| `src/audio/` | sound (clips in `public/audio/`, synth fallback, generated music), mute toggles |
| `scripts/` | clip analysis tools used to derive the numbers above |

Deploying: see [DEPLOY.md](DEPLOY.md).
