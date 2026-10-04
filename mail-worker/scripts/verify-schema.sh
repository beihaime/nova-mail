#!/usr/bin/env bash
#
# Deployment entry point for the pre/post-deploy schema gate.
#
# Usage: bash scripts/verify-schema.sh <d1-database-id>
#
# The D1 queries and the comparison against scripts/schema-manifest.mjs live in
# scripts/verify-schema.mjs (Node). `wrangler d1 execute --json` prints
# structured errors to stdout and exits non-zero; a shell `$(...)` under
# `set -e` swallowed those and aborted with no diagnostic. The Node verifier
# captures the exit code, validates `.success`, prints a sanitized reason and
# exits non-zero, so a failure is always visible in the deployment log.
set -euo pipefail

DB_ID="${1:?usage: verify-schema.sh <d1-database-id>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec node "$SCRIPT_DIR/verify-schema.mjs" "$DB_ID"
