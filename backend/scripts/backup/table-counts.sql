-- B1204 (ADR 0031): one line per table of the public schema, "table<TAB>exact row count".
-- Used twice with the same query, so the counts compare like with like:
--   at backup time (.github/workflows/backup.yml) and after a restore (npm run db:restore).
-- Run with: psql -X -At -F '<TAB>' -v ON_ERROR_STOP=1 -f table-counts.sql
SELECT format('SELECT %L, count(*) FROM public.%I', tablename, tablename)
  FROM pg_catalog.pg_tables
 WHERE schemaname = 'public'
 ORDER BY tablename
\gexec
