#!/usr/bin/env bash
set -euo pipefail
SVG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/build/icon.svg"

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. Outer ring must be gone (no large 3-digit radius circle; the hub is r="32").
grep -qE 'r="3[0-9][0-9]"' "$SVG" && fail "outer ring (large-radius circle) still present"

# 2. All 12 ticks must remain: 4 cardinal + 8 minor = 12 tick lines ending at y2 in {262,232}.
ticks=$(grep -cE 'y2="(262|232)"' "$SVG")
[ "$ticks" -eq 12 ] || fail "expected 12 tick lines, found $ticks"

# 2b. Ticks must sit at their exact hour rotations (rotation is the load-bearing attribute).
for deg in 0 90 180 270 30 60 120 150 210 240 300 330; do
  grep -q "rotate($deg 512 512)" "$SVG" || fail "tick at rotate($deg) missing"
done

# 3. Two hands must exist at correct length AND angle: minute (y2="282", rotate 60), hour (y2="357", rotate 305).
grep -q 'y2="282"' "$SVG" || fail "minute hand (y2=\"282\") missing"
grep -q 'y2="357"' "$SVG" || fail "hour hand (y2=\"357\") missing"
grep -q 'rotate(60 512 512)' "$SVG"  || fail "minute hand rotation (60) missing"
grep -q 'rotate(305 512 512)' "$SVG" || fail "hour hand rotation (305) missing"

# 4. Center hub must exist.
grep -q 'cx="512" cy="512" r="32"' "$SVG" || fail "center hub (r=\"32\") missing"

# 5. Background gradient must be intact.
grep -q '#FF5A4C' "$SVG" || fail "gradient start color missing"
grep -q '#C32014' "$SVG" || fail "gradient end color missing"

echo "PASS: icon.svg has no outer ring, 12 ticks, 2 hands, hub, gradient"
