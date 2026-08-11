# Backups & migration rollback

Written 2026-08-11, after discovering the app has been live at
`room-layout-app.vercel.app` with real venue/event data for a while without
either of these being addressed. Both matter more now than they would for a
hypothetical future deployment — there's real data to lose.

## Backups

**Check your Supabase plan first.** As of Aug 2026, Supabase's Free plan has
**no automated backups at all** — their own docs say to run manual backups
yourself. Pro and up get daily automated backups (7/14/30 day retention by
plan), with point-in-time recovery available as a paid add-on on Pro+.

Check Project Settings -> Add-ons in the Supabase dashboard to see what plan
you're on and what's already covered. If you're on Free, or want a backup
that isn't tied to a single vendor, use the script below.

**Manual backup:** `scripts/backup-db.sh` — takes a full compressed dump via
`pg_dump`. Run it:
- Right now, once, as an immediate safety net (there's real data on
  production today that has zero backup coverage until this runs).
- Before running any migration against production (`npx prisma migrate
  deploy` or via the Supabase SQL Editor) — a bad migration is the single
  most likely way to lose data, and a fresh backup right before one is cheap
  insurance.
- On some regular cadence otherwise — weekly is a reasonable starting point
  for a tool this size; tighten it if the sales team starts relying on it
  daily.

See the script's own comments for the exact command and where to get the
connection string. Store the resulting `.dump` file somewhere durable and
*off* this repo (it's gitignored under `/backups` for that reason) — it
contains real customer/venue data and password hashes.

**Restoring:** `pg_restore --clean --if-exists --no-owner --dbname="$TARGET_DATABASE_URL" path/to/backup.dump`
against a fresh (or intentionally-being-overwritten) database. Test this
once against a throwaway local database so the process is familiar before
you ever need it under pressure.

## Migration rollback

Prisma's `migrate deploy` applies migrations forward only — there's no
built-in "undo the last migration" command, and Prisma doesn't generate
reverse/down SQL automatically. Practical plan, in order of preference:

1. **Prevent the need for rollback in the first place.** Take a backup
   (above) immediately before deploying any migration to production.
   Ideally, test the migration against a copy of production data locally
   first (restore a recent backup into a local Postgres, run `npx prisma
   migrate deploy` against *that*, confirm the app still works) rather than
   finding out on production whether a migration is safe.
2. **If a migration causes a problem:** restore the pre-migration backup
   into a fresh database, and point `DATABASE_URL` at it (or restore in
   place if the schema damage is contained — use judgment based on what
   actually broke). This is much more reliable than hand-writing reverse SQL
   under time pressure, especially for anything beyond a trivial
   add-a-column change.
3. **For migrations that are additive and safe** (new nullable column, new
   table) — which describes every migration this app has shipped so far —
   the risk is low and a full restore is probably overkill; just be aware
   the option exists for anything riskier later (dropping/renaming a column,
   changing a type, adding a `NOT NULL` without a default).

No CI/staging environment exists yet to test migrations against before they
hit production — everything ships straight to `main` -> Vercel auto-deploy.
Worth considering a preview-branch workflow (Vercel preview deployments +
a separate Supabase branch/project) once the team relies on this daily,
but that's future scope, not addressed here.
