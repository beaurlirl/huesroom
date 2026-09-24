# Deploying to hue.onl/room

Nothing here has been run yet — it needs your go-ahead (prompt milestone 8: preview only; don't
touch hue.onl's project or production until you say so).

## 1. The game's own Vercel project (`huesroom`)

1. Push this repo to GitHub (`gh` is logged in as **beaurlirl**):
   `gh repo create beaurlirl/huesroom --private --source . --push` (or `--public`).
2. Import it in Vercel as a new project named **huesroom** (framework: Next.js, root: this folder).
3. Environment variables (Production and Preview):
   - `NEXT_PUBLIC_BASE_PATH` = `/room`
   - `NEXT_PUBLIC_SITE_URL` = `https://hue.onl` (absolute URLs for link previews)
4. Every branch push then builds a preview at `huesroom-<hash>.vercel.app/room/`.

## 2. Serving it at hue.onl/room (later, when you say so)

hue.onl is a static site (`~/Desktop/hue.onl`, repo `beaurlirl/hue.onl`). Add rewrites to its
`vercel.json` so `/room` is proxied to the game's project — the game already serves everything
(pages, `_next/` chunks, models, audio) under `/room`:

```json
{
  "rewrites": [
    { "source": "/room", "destination": "https://huesroom.vercel.app/room" },
    { "source": "/room/:path*", "destination": "https://huesroom.vercel.app/room/:path*" }
  ]
}
```

(Merge with the existing `headers` block; replace `huesroom.vercel.app` with the project's
production domain.)

## Checks before going live

- [ ] Real-phone test (≥ 30 fps, controls feel right).
- [ ] Audio licence: clips are Adobe "Aero Audio Starter Assets" — confirm they may be used on a
      public website (see `public/audio/CREDITS.md`).
- [ ] `URL="https://<preview>/room/?test" npm run test:qa` passes against the preview.
