# hue's room

A small 3D browser platformer: Hue (0.457 m tall) climbs, jumps, bounces and kicks books around a
green gallery room, collecting 11 chrome G coins against the clock. Built from
`../CURSOR_GAME_DEV_BUILD_PROMPT.md`.

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

## Tests

Both need the dev server on port 3100 (`npx next dev -p 3100`) and use the Playwright Chromium
in `~/Library/Caches/ms-playwright`.

```bash
npm run test:routes    # every route in prompt 1.5, via teleport + scripted input (18 legs)
npm run test:qa        # 24 end-to-end checks: intro lock, timer, keyboard play, pause, restart,
                       # win + best time, pose monitor, audio, touch UI, console errors
URL="http://localhost:3200/huesroom/?test" npm run test:qa   # against a sub-path build
```

## Where things are

| | |
|---|---|
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
