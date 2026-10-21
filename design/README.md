# Design

Approved screens for Gym Log, sized for iPhone (390 x 844 CSS px, exported at 3x).

| File | Screen |
| --- | --- |
| `01-today.png` | Today: next session, week strip, recent top sets |
| `02-active-workout.png` | Active workout: rest timer, warm-ups, top set, back-off (the core screen) |
| `03-lift-progress.png` | Lift progress: e1RM chart, stats, top-set history |
| `04-history.png` | History: search and session cards |
| `05-backup.png` | Backup: export/import, storage status, reminder |

`source/` holds the same screens as standalone HTML with the exact inline styles, spacing and icons. Open them in a browser, or read them for precise values.

Notes:
- The PNGs were rendered with fallback fonts (Inter and DejaVu Sans Condensed) because the real fonts could not be downloaded. The design uses Barlow (body) and Barlow Condensed (numbers and headings), which load from Google Fonts in `source/` and are a little narrower than the PNGs show.
- All numbers and names are sample data only.
