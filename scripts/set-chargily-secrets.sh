#!/usr/bin/env bash
# Sets the Chargily Pay secrets on the Supabase project so billing-checkout and chargily-webhook work.
# Run it in your own terminal: the key is typed hidden and goes straight to Supabase.
# Test or live mode is read from the key prefix, so CHARGILY_API_BASE can never disagree with the key.
#
#   scripts/set-chargily-secrets.sh
#
# Needs the Supabase CLI, logged in (`supabase login`). Project ref: $SUPABASE_PROJECT_REF,
# else supabase/.temp/project-ref, else asked.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v supabase >/dev/null || { echo "Install the Supabase CLI first." >&2; exit 1; }

ref="${SUPABASE_PROJECT_REF:-$(cat supabase/.temp/project-ref 2>/dev/null || true)}"
if [ -z "$ref" ]; then read -rp "Supabase project ref: " ref; fi

read -rsp "Chargily secret key (test_sk_... or live_sk_...), hidden: " key; echo
key="$(printf '%s' "$key" | tr -d '[:space:]"'"'"'')"
case "$key" in
  *_pk_*) echo "That is a PUBLIC key. Use the SECRET key (test_sk_... / live_sk_...) from the Chargily Developers Corner." >&2; exit 1 ;;
  test_sk_*) mode=TEST; base="https://pay.chargily.net/test/api/v2" ;;
  live_sk_*) mode=LIVE; base="https://pay.chargily.net/api/v2" ;;
  *) echo "The key must start with test_sk_ or live_sk_ (got ${#key} characters starting \"${key:0:8}\"). Copy the secret key again." >&2; exit 1 ;;
esac

if [ "$mode" = LIVE ]; then
  read -rp "This is a LIVE key: real money will move. Type 'live' to continue: " ok
  [ "$ok" = live ] || { echo "Cancelled."; exit 1; }
fi

default_url="https://store-assistant-dz.pages.dev"
read -rp "Dashboard URL [$default_url]: " dash
dash="${dash:-$default_url}"
dash="${dash%/}"

envfile="$(mktemp)"
trap 'rm -f "$envfile"' EXIT
chmod 600 "$envfile"
printf 'CHARGILY_SECRET_KEY=%s\nCHARGILY_API_BASE=%s\nDASHBOARD_URL=%s\n' "$key" "$base" "$dash" > "$envfile"

supabase secrets set --env-file "$envfile" --project-ref "$ref"

echo
echo "Done ($mode mode). Webhook URL to register in the Chargily dashboard if you want it there too:"
echo "  https://$ref.supabase.co/functions/v1/chargily-webhook"
echo "(billing-checkout already sends it per checkout.) Enforcement stays off until BILLING_ENFORCED is set."
