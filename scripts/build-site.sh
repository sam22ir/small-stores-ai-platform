#!/usr/bin/env bash
# Builds the dashboard and the landing site into one Cloudflare Pages output (apps/dashboard/dist).
# The dashboard is the base: landing files are copied on top, and the build stops if a landing
# file would replace a dashboard file. Only fonts/ may overlap, and only with identical bytes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASH="$ROOT/apps/dashboard"
LAND="$ROOT/apps/landing"
OUT="$DASH/dist"
LAND_DIST="$LAND/dist"
SITE_URL="https://store-assistant-dz.pages.dev"

fail() { echo "build-site: $*" >&2; exit 1; }

for app in "$DASH" "$LAND"; do
  if [ ! -d "$app/node_modules" ]; then
    (cd "$app" && npm ci)
  fi
done

# Dashboard first: vite empties apps/dashboard/dist, so the landing copy below starts clean.
(cd "$DASH" && npm run build)

# Same-origin dashboard links: PUBLIC_APP_URL is empty on purpose.
rm -rf "$LAND_DIST"
(cd "$LAND" && PUBLIC_APP_URL= PUBLIC_SITE_URL="$SITE_URL" npm run build)

[ -f "$OUT/app.html" ] || fail "dashboard build is missing app.html"
[ -f "$LAND_DIST/index.html" ] || fail "landing build is missing index.html"

collisions=0
while IFS= read -r -d '' src; do
  rel="${src#"$LAND_DIST"/}"
  dst="$OUT/$rel"
  if [ -e "$dst" ]; then
    case "$rel" in
      fonts/*)
        if ! cmp -s "$src" "$dst"; then
          echo "build-site: shared font differs between apps: $rel" >&2
          collisions=$((collisions + 1))
        fi
        ;;
      *)
        echo "build-site: landing file would overwrite dashboard file: $rel" >&2
        collisions=$((collisions + 1))
        ;;
    esac
  fi
done < <(find "$LAND_DIST" -type f -print0)
[ "$collisions" -eq 0 ] || fail "$collisions conflicting file(s); nothing was copied"

cp -R "$LAND_DIST"/. "$OUT"/
echo "build-site: combined site ready in $OUT"
