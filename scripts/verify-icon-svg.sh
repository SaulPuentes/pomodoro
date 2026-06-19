#!/usr/bin/env bash
set -euo pipefail
SVG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/build/icon.svg"

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. Outer ring must be gone (no large radius circle).
grep -q 'r="360"' "$SVG" && fail "outer ring (r=\"360\") still present"

# 2. All 12 ticks must remain: 4 cardinal + 8 minor = 12 tick lines ending at y2 in {262,232}.
ticks=$(grep -cE 'y2="(262|232)"' "$SVG")
[ "$ticks" -eq 12 ] || fail "expected 12 tick lines, found $ticks"

# 3. Two hands must exist: minute (y2="282") and hour (y2="357").
grep -q 'y2="282"' "$SVG" || fail "minute hand (y2=\"282\") missing"
grep -q 'y2="357"' "$SVG" || fail "hour hand (y2=\"357\") missing"

# 4. Center hub must exist.
grep -q 'cx="512" cy="512" r="32"' "$SVG" || fail "center hub (r=\"32\") missing"

# 5. Background gradient must be intact.
grep -q '#FF5A4C' "$SVG" || fail "gradient start color missing"
grep -q '#C32014' "$SVG" || fail "gradient end color missing"

echo "PASS: icon.svg has no outer ring, 12 ticks, 2 hands, hub, gradient"
