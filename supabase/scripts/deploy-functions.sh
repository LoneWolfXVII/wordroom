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

echo "==> vendoring @wordroom/shared for the bundler"
vendor_shared "$ROOT"

echo "==> deploying to $PROJECT_REF"
cd "$ROOT"
supabase functions deploy "$@" --project-ref "$PROJECT_REF"

echo "==> done (deno.json restored, vendored copy removed)"
