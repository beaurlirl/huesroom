# Deploying to hue.onl/huesroom

## Simplest: a static folder inside hue.onl (no separate Vercel project)

The game is fully client-side, so it exports to plain static files:

```bash
npm run export:hue                     # -> out/, built for the /huesroom path
rm -rf ~/Desktop/hue.onl/huesroom && cp -R out ~/Desktop/hue.onl/huesroom
cd ~/Desktop/hue.onl && git checkout -b huesroom && git add huesroom && git commit -m "Add Hue's Room at /huesroom"
git push -u origin huesroom            # Vercel builds a preview for the branch
```

Try the preview, then merge `huesroom` into `main` to put it live at hue.onl/huesroom.
Tested: the export served as a `/huesroom` folder from a plain static server passes QA 25/25
and the gamepad checks. (~24 MB, mostly the room model and the music.)

## Alternative: its own Vercel project + a rewrite

Nothing here has been run yet — it needs your go-ahead (prompt milestone 8: preview only; don't
touch hue.onl's project or production until you say so).

## 1. The game's own Vercel project (`huesroom`)

1. Push this repo to GitHub (`gh` is logged in as **beaurlirl**):
   `gh repo create beaurlirl/huesroom --private --source . --push` (or `--public`).
2. Import it in Vercel as a new project named **huesroom** (framework: Next.js, root: this folder).
3. Environment variables (Production and Preview):
   - `NEXT_PUBLIC_BASE_PATH` = `/huesroom`
   - `NEXT_PUBLIC_SITE_URL` = `https://hue.onl` (absolute URLs for link previews)
4. Every branch push then builds a preview at `huesroom-<hash>.vercel.app/huesroom/`.

## 2. Serving it at hue.onl/huesroom (later, when you say so)

hue.onl is a static site (`~/Desktop/hue.onl`, repo `beaurlirl/hue.onl`). Add rewrites to its
`vercel.json` so `/huesroom` is proxied to the game's project — the game already serves everything
(pages, `_next/` chunks, models, audio) under `/huesroom`:

```json
{
  "rewrites": [
    { "source": "/huesroom", "destination": "https://huesroom.vercel.app/huesroom" },
    { "source": "/huesroom/:path*", "destination": "https://huesroom.vercel.app/huesroom/:path*" }
  ]
}
```

(Merge with the existing `headers` block; replace `huesroom.vercel.app` with the project's
production domain.)

## Checks before going live

- [ ] Real-phone test (≥ 30 fps, controls feel right).
- [ ] Audio licence: clips are Adobe "Aero Audio Starter Assets" — confirm they may be used on a
      public website (see `public/audio/CREDITS.md`).
- [ ] `URL="https://<preview>/huesroom/?test" npm run test:qa` passes against the preview.
