# Render the app icons in icons/: a lime barbell on the dark background.
# Run from the repo root: powershell -File scripts\make_icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot "..\icons"
New-Item -ItemType Directory -Force $out | Out-Null

$bg = [System.Drawing.ColorTranslator]::FromHtml("#0E0F11")
$accent = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#C8F54A"))

function Fill-Round($g, $x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $g.FillPath($accent, $p)
  $p.Dispose()
}

# $scale is the barbell's width as a share of the icon; the maskable icon uses a smaller one to stay in the safe zone.
function Make-Icon($size, $name, $scale) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"
  $g.Clear($bg)
  $u = $size * $scale / 100   # the barbell is drawn on a 100-unit-wide grid
  $x0 = ($size - 100 * $u) / 2
  $cy = $size / 2
  Fill-Round $g ($x0 + 0) ($cy - 7 * $u) (5 * $u) (14 * $u) (1.5 * $u)      # collars
  Fill-Round $g ($x0 + 95 * $u) ($cy - 7 * $u) (5 * $u) (14 * $u) (1.5 * $u)
  Fill-Round $g ($x0 + 6 * $u) ($cy - 24 * $u) (10 * $u) (48 * $u) (3 * $u)   # big plates
  Fill-Round $g ($x0 + 84 * $u) ($cy - 24 * $u) (10 * $u) (48 * $u) (3 * $u)
  Fill-Round $g ($x0 + 17 * $u) ($cy - 16 * $u) (7 * $u) (32 * $u) (2.5 * $u) # small plates
  Fill-Round $g ($x0 + 76 * $u) ($cy - 16 * $u) (7 * $u) (32 * $u) (2.5 * $u)
  Fill-Round $g ($x0 + 24 * $u) ($cy - 3 * $u) (52 * $u) (6 * $u) (2 * $u)    # bar
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Make-Icon 192 "icon-192.png" 0.74
Make-Icon 512 "icon-512.png" 0.74
Make-Icon 512 "icon-maskable-512.png" 0.56
Make-Icon 180 "apple-touch-icon.png" 0.74
