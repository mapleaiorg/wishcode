#!/usr/bin/env bash
#
# Wish Code — generate build/icon.icns from build/icon.png.
#
# Runs only on macOS (uses the system `sips` + `iconutil`). On other
# platforms this is a no-op; electron-builder will rasterize icon.png
# for Windows / Linux targets separately.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "$(uname -s)" != "Darwin" ]; then
  echo "[build-icns] not macOS — skipping .icns generation."
  exit 0
fi

if [ ! -f build/icon.png ]; then
  echo "[build-icns] build/icon.png missing — run 'node scripts/build-icon.mjs' first." >&2
  exit 1
fi

SET=build/icon.iconset
rm -rf "$SET"
mkdir -p "$SET"

# Standard Apple iconset sizes. @2x variants reuse the larger PNG.
for sz in 16 32 64 128 256 512 1024; do
  sips -z $sz $sz build/icon.png --out "$SET/icon_${sz}x${sz}.png" > /dev/null
done

cp "$SET/icon_32x32.png"     "$SET/icon_16x16@2x.png"
cp "$SET/icon_64x64.png"     "$SET/icon_32x32@2x.png"
cp "$SET/icon_256x256.png"   "$SET/icon_128x128@2x.png"
cp "$SET/icon_512x512.png"   "$SET/icon_256x256@2x.png"
cp "$SET/icon_1024x1024.png" "$SET/icon_512x512@2x.png"

# 64 and 1024 aren't standard iconset base filenames — drop them to avoid
# iconutil warnings; the @2x copies carry their bits.
rm "$SET/icon_64x64.png" "$SET/icon_1024x1024.png"

iconutil -c icns "$SET" -o build/icon.icns
rm -rf "$SET"
echo "[build-icns] wrote build/icon.icns"
