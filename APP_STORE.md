# Putting Hue Leaves Home in an iOS app

The game is a static, fully client-side site, so any app that can show a web view can carry it.

## The build

```bash
npm run export:app      # -> out/  (24 MB, served from the root of the app's own web server)
```

`export:hue` is the same build for hue.onl/huesroom (base path `/huesroom`); the app build has no
base path. Open `out/index.html` through the wrapper's local server, **not** `file://` (the models
and audio are fetched).

What the build does and does not do, which is what App Review and the privacy label care about:

- Everything it needs is inside `out/`: room, Hue, clips, Draco decoder, fonts, music. No CDN, no
  API calls, no analytics, no accounts. Offline works.
- Stores on the device only: best time, mute settings, and a `hue.unlocked` flag
  (`localStorage`, plus a cookie that only matters on the web).
- The one outbound link is **"unlock hue.onl"** on the win panel (`src/ui/theme.ts`). A Capacitor
  shell normally hands external navigation to Safari, leaving the game in place; the exit fog
  clears itself after ~4 s if the page is still there (not yet tried in a real shell). If the app should
  not link out, remove that button in `src/Hud.tsx` before building.
- Pauses and silences audio when the app goes to the background; it stays paused until the player resumes.
- Safe areas (notch, home bar) are handled; landscape is the intended orientation.

## Wrapping it (Capacitor, untested here: needs Xcode and your Apple team)

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Hue Leaves Home" <your.bundle.id> --web-dir out
npm run export:app && npx cap add ios && npx cap sync ios && npx cap open ios
```

In Xcode: lock orientations to Landscape Left/Right, hide the status bar, set the team and bundle
id, add the 1024 px icon. Any other shell works the same way; the only contract is "serve `out/`
from a root URL".

## Before you submit

- [ ] Run it on a real iPhone (≥ 30 fps, controls feel right). Only desktop Chromium has been
      tested, including an iPhone-landscape viewport with touch.
- [ ] App icon (1024 px), screenshots, age rating, and a support / privacy URL.
- [ ] Privacy label: "Data Not Collected" holds as long as nothing is added from the
      `cursor/huesroom-path-and-analytics-5249` branch (Vercel Web Analytics).
- [ ] Decide whether the app keeps the "unlock hue.onl" link (see above).
- [ ] Music is the owner's own GarageBand tracks and the font is Union (the owner's), see
      `public/audio/CREDITS.md`.
