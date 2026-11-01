# Apple Health sync

A web app can't read HealthKit, so the iPhone pushes its numbers to this Worker and the app pulls them.

```
iPhone (Shortcut or Health Auto Export)  --POST /health-->  Worker (KV "h:<day>")  <--GET /health--  Gym Log app
        Bearer <HEALTH_KEY>                                                          Bearer <BACKUP_KEY>
```

- `HEALTH_KEY` is a Worker secret kept apart from `BACKUP_KEY`. It can only `POST /health`, so a key stored in a
  phone automation can add numbers but never read or list backups. Keys live in `../.env` and as Worker secrets,
  never in git.
- Every metric is optional. Send only what you have; days with nothing stay blank (never 0).
- Numbers typed by hand in the app are never overwritten by synced ones.

## Shape 1: simple (an iOS Shortcut)

```json
{ "date": "2026-11-01", "weightKg": 84.2, "steps": 8123, "sleepHours": 7.25, "activeKcal": 512, "restingHr": 58 }
```

`sleepMin` works instead of `sleepHours`. `{ "days": [ ... ] }` sends several days. Commas as decimals are fine.

## Shape 2: Health Auto Export (paid app, can also backfill history)

Set its REST API automation to this Worker's `/health` URL, JSON, header `Authorization: Bearer <HEALTH_KEY>`, and
turn on: Step Count, Active Energy, Resting Heart Rate, Weight, Sleep Analysis. The Worker reads `weight_body_mass`
(kg, lb or st), `step_count`, `active_energy` (kcal or kJ), `resting_heart_rate` and `sleep_analysis` (hours or
minutes), adds up samples within a day (steps, energy, sleep) and takes the latest reading (weight, heart rate).
The field names follow that app's published format; confirm against a real export the first time.

## Try it locally

`npx wrangler dev` in this folder (port 8787, secrets in `.dev.vars`, a test `HEALTH_KEY` is there), then:

```bash
curl -X POST http://localhost:8787/health -H "Authorization: Bearer $HEALTH_KEY" -d '{"date":"2026-11-01","steps":8000}'
curl "http://localhost:8787/health?from=2026-10-01" -H "Authorization: Bearer $BACKUP_KEY"
```

Tests for the parser: `node --test worker/src/health-parse.test.js` from the repo root.
