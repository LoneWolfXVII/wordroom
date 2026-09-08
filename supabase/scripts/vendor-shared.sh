#!/usr/bin/env bash
#
# Put `@wordroom/shared` where the Edge Runtime can see it, and point deno.json
# at the copy. Sourced by both `deploy-functions.sh` and `serve-functions.sh`.
#
# Why: the functions import the shared package straight from `packages/shared`,
# so the scoring rules exist once rather than twice. That works for `deno check`
# and `deno test`, which run from the repo. It does not work for the Edge
# Runtime — deploying *or* serving — because that runs in a container mounting
# only `supabase/functions`, and the relative path escapes the mount.
#
# So the source is copied in for the length of one command and removed after.
# `_vendor/` is gitignored; there is still one source of truth.

vendor_shared() {
  local root="$1"
  local functions="$root/supabase/functions"
  local vendor="$functions/_vendor/shared"

  rm -rf "$functions/_vendor"
  mkdir -p "$vendor"
  local count=0
  for f in "$root"/packages/shared/src/*.ts; do
    case "$f" in *.test.ts) continue ;; esac
    cp "$f" "$vendor/"
    count=$((count + 1))
  done

  cp "$functions/deno.json" "$functions/deno.json.vendor-backup"
  node - "$functions/deno.json" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs')
const path = process.argv[2]
const config = JSON.parse(readFileSync(path, 'utf8'))
const rewrite = (s) => s.replace('../../packages/shared/src/', './_vendor/shared/')
const imports = {}
for (const [key, value] of Object.entries(config.imports)) imports[rewrite(key)] = rewrite(value)
writeFileSync(path, `${JSON.stringify({ ...config, imports }, null, 2)}\n`)
NODE
  echo "    vendored $count shared modules"
}

unvendor_shared() {
  local functions="$1/supabase/functions"
  if [ -f "$functions/deno.json.vendor-backup" ]; then
    mv -f "$functions/deno.json.vendor-backup" "$functions/deno.json"
  fi
  rm -rf "$functions/_vendor"
}
