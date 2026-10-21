# Gym Log

A personal strength-training tracker. Log warm-ups, one heavy top set and an optional back-off, and watch your estimated 1RM trend over time.

Installable on iPhone from Safari (Add to Home Screen) and works offline. Data stays on the device; use the Backup screen to export it.

**Live app:** https://guitarmanj55.github.io/gym-log/ (open in Safari on the iPhone, then Share > Add to Home Screen).

## Run it locally

For development on the laptop only. It is a static site. Serve the folder and open http://localhost:8123:

```
python -m http.server 8123
```

## Tests

```
node --test
```

No Node? Serve the folder and open http://localhost:8123/scripts/browser-tests.html, which runs the same test files in the browser.

Regenerate the icons with `powershell -File scripts\make_icons.ps1`.

## Status

Build steps 1 to 4: the app shell (offline, installable), the IndexedDB data layer, JSON backups, the Active workout screen (prefill from last time, steppers, rest timer, live e1RM, plates per side), Today (up next, week strip, recent top sets) and History (search, PRs). Lifts is a placeholder. See `CLAUDE.md` for the rules and build order, and `design/` for the screens.
