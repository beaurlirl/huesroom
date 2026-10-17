# What deploys where

As of 2026-10-09.

- **Pushing `main` auto-deploys Production on the Vercel project `huesroom`**: https://huesroom.vercel.app (served at the root, no base path). That is the web game's home for now. Don't push `main` without the owner's go.
- **`hue.onl/huesroom` is a separate static copy** held in the private repo `beaurlirl/hue.onl` (built 2026-10-06). Pushing the game does **not** change it. The original hue.onl site is being kept unassociated with the game and levels for the moment, so leave that copy alone until the owner decides what to do with it (remove or redirect).
- **The iOS app** is a native shell around `npm run export:app`: see [APP_STORE.md](APP_STORE.md).
- Closed unmerged on 2026-10-09: huesroom #1 (analytics and path prefix), huesroom #2 (lighter start), hue.onl #1 (rewrites proxying `/huesroom`). Their branches still exist.

## Caching

The big files (models, clips, music, effect pictures, the draco decoder) are sent with `Cache-Control: public, max-age=31536000, immutable` in production (`next.config.ts`), so a returning player's browser does not ask about
them again. Their addresses carry `?v=<the commit>` (`src/config.ts` `versioned`, from `VERCEL_GIT_COMMIT_SHA`), so a new deploy still reaches everyone: every deploy re-downloads them once. Not in development
(the stamp is the time the dev server started), and not in a static export (the app and plain static hosts: no stamp, no headers). If a big file is ever served from a new place that is not under `/levels`, `/room`,
`/hue`, `/audio`, `/fx` or `/draco`, add the folder to `BIG_FILES` in `next.config.ts`.

## Builds

```bash
npm run export:app   # -> out/  no base path (the iOS wrapper, or any root-path host)
npm run export:hue   # -> out/  base path /huesroom (only for a sub-path host such as the paused hue.onl copy)
```

## The paused hue.onl copy (only if the owner asks)

```bash
npm run export:hue
rm -rf ~/Desktop/hue.onl/huesroom && cp -R out ~/Desktop/hue.onl/huesroom
cd ~/Desktop/hue.onl && git checkout -b huesroom && git add huesroom && git commit -m "Update Hue's Room at /huesroom"
git push -u origin huesroom            # Vercel builds a preview for the branch; merge to main to go live
```

## Checks before going live

- [ ] Real-phone test (30 fps or better, controls feel right).
- [ ] `URL="https://<preview>/?test" npm run test:qa` passes against the preview.
- [ ] Audio: the music is the owner's own tracks (see `public/audio/CREDITS.md`); no third-party clips.
