#!/usr/bin/env bash
#
# Verify a deployed D1 database against the schema required by the current
# Worker source (scripts/schema-manifest.mjs).
#
# Usage: bash scripts/verify-schema.sh <d1-database-id>
#
# Runs read-only queries through Wrangler and fails closed: any query error,
# missing object or violated data invariant exits non-zero, which aborts the
# deployment step before the Worker is released.
set -euo pipefail

DB_ID="${1:?usage: verify-schema.sh <d1-database-id>}"

d1() {
	pnpm wrangler d1 execute "$DB_ID" --remote --yes --json --command "$1"
}

# `wrangler d1 execute --json` prints an array of result sets.
pick() {
	printf '%s' "$1" | jq -e "$2"
}

pick_raw() {
	printf '%s' "$1" | jq -er "$2"
}

TABLES_JSON=$(d1 "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%';")
INDEXES_JSON=$(d1 "SELECT name FROM sqlite_master WHERE type = 'index';")

# D1 only authorizes `pragma_table_info` with a literal argument, so build one
# UNION ALL query from the table names the database reports. Names are validated
# before interpolation; nothing else is ever placed into the SQL.
COLUMNS_SQL=""
while IFS= read -r table; do
	[ -n "$table" ] || continue
	case "$table" in
		*[!A-Za-z0-9_]*) echo "Skipping unexpected table name in schema check: $table" >&2; continue ;;
	esac
	COLUMNS_SQL="${COLUMNS_SQL}${COLUMNS_SQL:+ UNION ALL }SELECT '$table' || '.' || name AS col FROM pragma_table_info('$table')"
done < <(pick_raw "$TABLES_JSON" '.[0].results[].name')

if [ -z "$COLUMNS_SQL" ]; then
	echo "❌ The deployed D1 reports no tables; refusing to release the Worker." >&2
	exit 1
fi

COLUMNS_JSON=$(d1 "$COLUMNS_SQL")

INVARIANTS_JSON=$(d1 "SELECT (SELECT count(*) FROM user WHERE email != lower(trim(email))) AS noncanonical_user, (SELECT count(*) FROM account WHERE email != lower(trim(email))) AS noncanonical_account;")

jq -n \
	--argjson tables "$(pick "$TABLES_JSON" '[.[0].results[].name]')" \
	--argjson indexes "$(pick "$INDEXES_JSON" '[.[0].results[].name]')" \
	--argjson columns "$(pick "$COLUMNS_JSON" '[.[0].results[].col]')" \
	--argjson invariants "$(pick "$INVARIANTS_JSON" '.[0].results[0]')" \
	'{tables: $tables, indexes: $indexes, columns: $columns, invariants: $invariants}' \
	| node scripts/check-schema.mjs
