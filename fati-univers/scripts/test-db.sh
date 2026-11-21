#!/usr/bin/env bash
# Teste le schéma et la sécurité de la base sur un PostgreSQL réel.
# Usage : PGHOST=localhost PGPORT=5432 PGUSER=postgres scripts/test-db.sh
# (le CI GitHub lance ce script automatiquement)
set -euo pipefail
cd "$(dirname "$0")/.."

DB=fati_security_test
SQL=apps/api/prisma/sql
DDL=$(mktemp)

python3 scripts/check_schema.py --ddl "$DDL"

psql -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$SQL/000_roles.sql"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$DDL"
for f in 001_rls.sql 002_audit_append_only.sql 003_finance_guards.sql 004_grants.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$SQL/$f"
done
# Deuxième passage : les scripts doivent être idempotents.
for f in 001_rls.sql 002_audit_append_only.sql 003_finance_guards.sql 004_grants.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$SQL/$f"
done

psql -v ON_ERROR_STOP=1 -d "$DB" -f apps/api/prisma/sql/security.test.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //'
psql -q -d postgres -c "DROP DATABASE $DB"
rm -f "$DDL"
