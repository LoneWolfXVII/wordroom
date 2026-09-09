#!/usr/bin/env bash
#
# Deploy the edge functions.
#
# Why this exists: the functions import `@wordroom/shared` straight from source,
# which lives at `packages/shared/src` — outside `supabase/functions`. That is
# deliberate (one copy of the scoring rules, not two), and it works for
# `deno check`, `deno test` and `supabase functions serve`, all of which run
# from the repo. It does *not* work for `supabase functions deploy`: the bundler
# runs in a container that only mounts `supabase/functions`, so the relative
# path escapes the mount and the bundle fails with "Module not found".
#
# So we vendor the shared source into the functions directory just long enough
# to bundle it, deploy with an import map rewritten to point at the copy, and
# then delete it. The copy exists for the length of one deploy and is never
# committed — `_vendor/` is gitignored. There is still exactly one source of
# truth for the domain logic.
#
#   SUPABASE_ACCESS_TOKEN=... ./supabase/scripts/deploy-functions.sh [function...]
#
# With no arguments it deploys every function.

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-cdrmvqvgwwuqxslygilq}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# The CLI ignores --import-map ("no longer supported") and always reads
# deno.json, so the vendor helper swaps that file itself and puts the original
# back afterwards. The trap covers Ctrl-C and any failure mid-deploy.
# shellcheck source=./vendor-shared.sh
. "$ROOT/supabase/scripts/vendor-shared.sh"

cleanup() {
  unvendor_shared "$ROOT"
}
trap cleanup EXIT

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "error: SUPABASE_ACCESS_TOKEN is not set." >&2
  echo "Create one at https://supabase.com/dashboard/account/tokens" >&2
  echo "(scope it to this project, Edge Functions read-write is enough)." >&2
  exit 1
fi

# Refuse to deploy onto a schema that cannot serve the code being deployed.
#
# This script used to know nothing about migrations, which was survivable while
# only Edge Functions talked to the database: a stale schema meant one function
# returning 500. The browser now calls PostgREST directly, so a missing function
# is `404 PGRST202` on every guess and the game is unplayable — and the deploy
# that caused it would still have printed "done".
#
# The check itself lives in check-rpc-migrations.mjs, so CI and this script read
# the same list from the same place rather than drifting apart.
if [ -f "$ROOT/apps/web/.env.production.local" ]; then
  SUPABASE_URL=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' "$ROOT/apps/web/.env.production.local" | cut -d= -f2- | tr -d '"')
  SUPABASE_KEY=$(grep -m1 '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' "$ROOT/apps/web/.env.production.local" | cut -d= -f2- | tr -d '"')
  if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_KEY:-}" ]; then
    echo "==> checking the deployed schema can serve this code"
    node "$ROOT/supabase/scripts/check-rpc-migrations.mjs" --probe "$SUPABASE_URL" "$SUPABASE_KEY"
  else
    echo "note: no url/key in apps/web/.env.production.local; skipping the schema check." >&2
  fi
else
  echo "note: apps/web/.env.production.local not found; skipping the schema check." >&2
fi

echo "==> vendoring @wordroom/shared for the bundler"
vendor_shared "$ROOT"

echo "==> deploying to $PROJECT_REF"
cd "$ROOT"
supabase functions deploy "$@" --project-ref "$PROJECT_REF"

echo "==> done (deno.json restored, vendored copy removed)"
