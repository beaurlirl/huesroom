<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project orientation (public-safe)

- This is **Hue Leaves Home**, a 3D browser game (Next.js, react-three-fiber, Rapier) that also ships as an iOS app. This folder is the git repo (`github.com/beaurlirl/huesroom`, public). `main` is the shippable branch and Vercel auto-deploys it to a public web copy, so **never push `main`, merge or close PRs, or change a deployment without the owner's explicit go.** Work on a branch and report.
- Product direction, partners and plans are private on purpose. Do not add them, or keys, partner names or business details, to this repo. The owner's private brief is `../HUE_PROJECT_BRIEF.md` on their machine.
- Privacy posture (keeps the App Store label "Data Not Collected"): no analytics, accounts, cookies, outbound links or AI/chat calls in the game or app builds. Progress lives on the device. Ask before adding any of these.
- Levels are data: a room model plus an entry in `src/levels.ts` (the node contract is in README > Levels). Don't hard-code room specifics anywhere else.
- Before calling something done: `npx tsc --noEmit`, `npx eslint`, then with `npx next dev -p 3100` running: `npm run test:qa`, `npm run test:routes`, `npm run test:gamepad`, `npm run test:flow`, `npm run test:reach` (and `test:street`, `test:deli`, `test:menu` when you touch those). Run them one after another, never beside another browser job: the real-time ones depend on the game running at full speed. New behaviour gets a check. When a level's model changes, record its routes again (README > Tests).
- Builds: `npm run export:hue` (base path `/huesroom`) and `npm run export:app` (no base path, for the iOS wrapper). What deploys where: [DEPLOY.md](DEPLOY.md). The app: [APP_STORE.md](APP_STORE.md).
