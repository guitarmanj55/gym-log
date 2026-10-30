# Gym Log

Personal strength-training tracker, built for one user on an iPhone 16 Pro. Shipped as a PWA from GitHub Pages and installed with Add to Home Screen. There is no Mac, no Xcode and no App Store, so everything must work as a web app. Same approach as the sibling app `hangeul-lab`.

## How the user trains
Each exercise is: one or more light warm-up sets, then ONE top set as heavy as possible (often to failure), then an optional back-off set. There is no fixed program. Progress is judged by the e1RM trend of top sets. The app only suggests "beat last time" (add 2.5 kg or one rep); do not build a program or progression engine in v1.

The app is built around **saved workouts** (e.g. Push, Legs): a name and an ordered list of exercises, stored in the `workouts` store. Today lists them; one tap starts a session from one. Exercises added during a session are added to its workout too; removing one only affects that session.

Set types: `warmup`, `top`, `backoff`. The UI calls a `top` set just "Set" (the user asked to drop "top"); the stored type stays `top`. "+ Set" copies the kg and reps of the set just logged.
e1RM uses Epley: `weight * (1 + reps / 30)`; for 1 rep it is just the weight.

## Rules
- **Static site, no build step, no bundler, no npm dependencies.** Plain ES modules loaded with `<script type="module">`, served as-is by GitHub Pages. Keep it that way unless there is a clear reason.
- **Relative paths only** (`./`, `src/...`), never a leading slash. The site is served from `/gym-log/`, so absolute paths break the deployed app.
- **Storage is IndexedDB**, accessed through a small hand-written wrapper in `src/db/`. The stores and indexes are defined in `src/db/schema.js`. Changing a store or the meaning of a field needs a `DB_VERSION` bump and a migration in `createStores()`. Never change saved data without a migration.
- **Backups:** JSON export/import is an MVP feature. Backup files carry a `schema` number and imports run through the same migrations. Call `navigator.storage.persist()` on first run.
- **Automatic backup** (since v0.10): `src/cloud.js` uploads the full backup JSON to the Worker in `worker/` (`gym-log-backup.t212-pocket.workers.dev`, KV namespace `BACKUPS`) on launch, on visibility change and after finishing a workout, only when the data changed (fingerprint in `src/lib/backup.js`) and never mid-workout or when empty. The Worker keeps every copy forever (the user wants years of history). Auth is one shared key: Worker secret `BACKUP_KEY`, also in `.env` as `GYM_LOG_BACKUP_KEY`, pasted once into the Backup screen and kept in the phone's localStorage (not in settings, so it never lands in exported files). On localhost the app talks to `wrangler dev` on port 8787 (test key in `worker/.dev.vars`), so testing never touches real backups. Deploy Worker changes with `npx wrangler deploy` in `worker/`.
- **Separate storage:** the Safari tab and the installed app do not share data. Real logging happens in the installed app.
- **Release routine:** bump `APP_VERSION` and `APP_WHATS_NEW` in `index.html`, bump `CACHE` in `sw.js` and update its `SHELL` list when files are added or renamed, run the tests, then push to `main` (Pages redeploys).
- **Service worker:** network-first for HTML, manifest and JS modules so updates arrive when online; cache-first for icons and fonts. Every module file must be in `SHELL` or the app breaks offline.
- **iOS install:** needs `apple-mobile-web-app-capable`, an `apple-touch-icon` (180x180), `viewport-fit=cover`, and a manifest with `display: standalone`. Install only works from Safari.
- **Exercise setup must stay quick:** name plus one of six muscle groups (`MUSCLES` in `src/lib/exercise.js`); equipment is guessed from the name (`guessEquipment`) and sits in a fold with setup notes. Don't bring back detailed muscles, angle or grip pickers.
- **Rest timer:** always 1 minute (`REST_SEC` in `src/lib/rest.js`), +30s button for longer. Store an end timestamp and compute remaining time on resume. Never rely on `setInterval` counting down, because iOS suspends JS in the background. The Vibration API does not work on iOS, so use sound and visual cues. Use the Screen Wake Lock API during an active workout.
- **Units:** kg only. Default step 2.5 kg. Bar 20 kg. Plate set is configurable (default 25, 20, 15, 10, 5, 2.5, 1.25).
- **Pure logic is separate from UI:** e1RM, plate maths and the suggestion rule live in `src/lib/` as plain JS with no DOM or browser globals, each with a `*.test.js` beside it. Run them with `node --test`.
- **UX:** one-handed use, touch targets at least 44px, dark UI, numeric inputs use `inputmode="decimal"`. Logging a set must take seconds.
- **Light and dark:** dark is the default design; colours come from CSS tokens at the top of the stylesheet.
- **Privacy:** this repo is public (free Pages). Never commit backups, exports or any personal data. Secrets go in `.env`, never committed.

## Layout
- `index.html` app shell and screen mounting
- `src/db/schema.js` stores, indexes, defaults, backup shape and migrations
- `src/db/` the IndexedDB wrapper (open, get, put, query, export, import)
- `src/lib/` pure logic and its tests
- `src/screens/` one module per screen (today, workout editor, active, lift, overview (All lifts view of the Lifts tab), history, backup, summary)
- `src/cloud.js` automatic backup client; `worker/` the Cloudflare Worker that stores every backup
- `src/lib/feedback.js` PRs as they're logged, hard sets per muscle this week, lifts not trained lately, the workout summary
- `sw.js`, `manifest.webmanifest`, `icons/`
- `design/` the approved screens, exported as images or PDF

## State of play
- **v0.15 (2026-10-30):** Lifts tab gains an "All lifts" view next to "One lift" (`src/screens/overview.js`, pure logic in `src/lib/overview.js`). Progress: each lift indexed to 100 at its first session in the range, weekly mean across lifts, plus each lift's % change ranked underneath. Effort: each session's e1RM as % of that lift's all-time best, weekly mean. Bodyweight lifts are left out (e1RM is added kg); lifts with too little history in the range are counted in a note. No schema change. Checked in the preview at 375 wide with seeded data; not tried on the iPhone.
- Headline uses the latest week, so one bad day swings it; a smoothed headline is a possible tweak.
- v0.14 (2026-10-26): Lift screen gains "Rep bests · all time" (heaviest top set for 3+/5+/8+/10+ reps, `repBests` in `progress.js`). Today gains "Workouts per week" bars for the last 8 weeks (`weeklyCounts` in `history.js`). The summary shows volume against the last finished session of the same saved workout (`volumeChange` in `feedback.js`). No schema change. Checked in the preview at 390x844 with seeded data; not tried on the iPhone.
- Backlog ideas: smoothed strength-index headline; volume change in the shared summary text; a per-workout volume trend; rep bests for bodyweight lifts need a look (they show added kg).

## Design reference
The approved screens are in `design/` as PNGs (Today, Active workout, Lift progress, History, Backup), with exact styling in `design/source/*.html`. Match their styling. Since v0.9 Today shows saved workouts instead of the "Up next" card in the design. The numbers shown in the designs are sample data only. The PNGs use fallback fonts, so trust the real fonts (Barlow, Barlow Condensed) and the source HTML for sizing.

Tokens:
- Background `#0E0F11`, surface `#17191D`, raised `#1F2227`, line `#2A2E35`
- Text `#F2F3F5`, muted `#9EA3AD`
- Accent `#C8F54A` (dark text `#0E0F11` on accent), warning `#F5B84A`
- Fonts: Barlow (body), Barlow Condensed (numbers and headings)

## Build order
1. Static shell: `index.html`, manifest, service worker, icons. Push to `main`, enable Pages, install on the iPhone. No features yet.
2. Data layer: `schema.js`, DB wrapper, export/import, tests.
3. Active workout screen (the core of the app): prefill from last session, steppers, rest timer, live e1RM, per-side plates.
4. Today and History screens.
5. Lift progress screen with the e1RM chart (inline SVG, no chart library).
6. Backup screen and the weekly reminder.

Keep each step a small working slice that is deployed and tested on the phone.

## Testing
Serve the folder (`python -m http.server 8123`, using `C:\Users\OJacq\AppData\Local\Programs\Python\Python312\python.exe` since Python is not on PATH) rather than opening the file, so the service worker runs. Click through every screen at phone width. Run `node --test` for the logic (Node 24 is installed); as a fallback, open `scripts/browser-tests.html` on the local server (it runs the same files through `scripts/node-shim.js`, so add new test files to its `FILES` list).
