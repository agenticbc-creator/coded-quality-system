#!/usr/bin/env bash
# Builds a throwaway database the way the hosted one was built (0001–0008, the demo seeds, then 0009 to 0014)
# and runs the access tests against it. Needs a local Postgres 15+; nothing here touches the hosted project.
#   PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-qs_test}
P="psql -v ON_ERROR_STOP=1 -q -X"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null
run() { $P -d "$DB" -f "$1" 2>&1 | grep -v "NOTICE" || true; }
run supabase/tests/supabase_stub.sql
for f in supabase/migrations/000[1-8]_*.sql; do run "$f"; done
{ echo "select set_config('seed.demo_password', 'local-test-only', false);"; cat supabase/seed/demo_seed.sql; } | $P -d "$DB" >/dev/null 2>&1
$P -d "$DB" -f supabase/seed/phase2_seed.sql >/dev/null 2>&1
for f in supabase/migrations/0009_*.sql supabase/migrations/0010_*.sql supabase/migrations/0011_*.sql supabase/migrations/0012_*.sql supabase/migrations/0013_*.sql supabase/migrations/0014_*.sql; do run "$f"; done
{ echo "select set_config('seed.demo_password', 'local-test-only', false);"; cat supabase/seed/coordinators_seed.sql; } | $P -d "$DB" >/dev/null
$P -d "$DB" -f supabase/tests/access.sql
# Then rehearse going live on the same throwaway database: clear the sample data and set up from empty.
$P -d "$DB" -f supabase/tests/live.sql
