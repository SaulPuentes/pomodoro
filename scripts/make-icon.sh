#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVG="$ROOT/build/icon.svg"
SET="$ROOT/build/icon.iconset"
ICNS="$ROOT/build/icon.icns"
PNG="$ROOT/build/icon.png"

[ -f "$SVG" ] || { echo "error: $SVG not found" >&2; exit 1; }

render() {  # render <size> <outfile>
  local size="$1" out="$2"
  if command -v cairosvg >/dev/null 2>&1; then
    cairosvg "$SVG" --output-width "$size" --output-height "$size" -o "$out"
  elif command -v magick >/dev/null 2>&1; then
    magick -background none -density 512 "$SVG" -resize "${size}x${size}" "$out"
  else
    echo "error: need cairosvg or magick to render SVG" >&2
    exit 1
  fi
}

rm -rf "$SET"
mkdir -p "$SET"

render 16   "$SET/icon_16x16.png"
render 32   "$SET/icon_16x16@2x.png"
render 32   "$SET/icon_32x32.png"
render 64   "$SET/icon_32x32@2x.png"
render 128  "$SET/icon_128x128.png"
render 256  "$SET/icon_128x128@2x.png"
render 256  "$SET/icon_256x256.png"
render 512  "$SET/icon_256x256@2x.png"
render 512  "$SET/icon_512x512.png"
render 1024 "$SET/icon_512x512@2x.png"

iconutil -c icns "$SET" -o "$ICNS"
render 512 "$PNG"

echo "wrote $ICNS and $PNG"
