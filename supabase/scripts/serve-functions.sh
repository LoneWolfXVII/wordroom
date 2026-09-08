#!/usr/bin/env bash
#
# Serve the Edge Functions against the local stack.
#
#   supabase start            # once
#   ./supabase/scripts/serve-functions.sh
#
# Vendors `@wordroom/shared` first, for the same reason the deploy script does:
# the Edge Runtime container mounts only `supabase/functions`, so a relative
# import of `packages/shared` cannot be resolved from inside it. Without this the
# functions answer BOOT_ERROR and the app cannot create a room locally.
#
# Ctrl-C restores deno.json and removes the vendored copy.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=./vendor-shared.sh
. "$ROOT/supabase/scripts/vendor-shared.sh"

cleanup() { unvendor_shared "$ROOT"; }
trap cleanup EXIT

echo "==> vendoring @wordroom/shared for the local runtime"
vendor_shared "$ROOT"

echo "==> serving functions (Ctrl-C to stop)"
cd "$ROOT"
supabase functions serve "$@"
