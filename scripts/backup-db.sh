#!/usr/bin/env bash
# Manual production database backup.
#
# Why this exists: Supabase's Free plan has NO automated backups at all
# (confirmed against Supabase's own docs, Aug 2026 — "We recommend that free
# tier plan projects regularly export their data using the Supabase CLI
# db dump command"). Pro/Team/Enterprise plans do get automated daily
# backups, but this script is a zero-cost safety net either way, and the
# only option at all on Free.
#
# Usage:
#   DATABASE_URL="postgresql://...supabase connection string..." ./scripts/backup-db.sh
#
# Get the connection string from the Supabase dashboard: Project Settings ->
# Database -> Connection string (URI). Use the "Session pooler" or direct
# connection string, not the app's pooled/transaction-mode one if those
# differ — pg_dump needs a plain session connection.
#
# Requires the `pg_dump` client (Postgres 16 to match the app's version;
# `brew install postgresql@16` on macOS, `apt install postgresql-client-16`
# on Debian/Ubuntu, or use the one bundled with Postgres.app on macOS).

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: set DATABASE_URL to your Supabase connection string first." >&2
  echo "  DATABASE_URL=\"postgresql://...\" $0" >&2
  exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/room-layout-backup-$TIMESTAMP.dump"

echo "Backing up to $OUT_FILE ..."
# -Fc = custom format: compressed, and restorable with pg_restore (supports
# selective/parallel restore, unlike a plain .sql text dump).
pg_dump "$DATABASE_URL" -Fc -f "$OUT_FILE"

echo "Done. $(du -h "$OUT_FILE" | cut -f1) written."
echo ""
echo "To restore this backup into a (fresh, empty) database:"
echo "  pg_restore --clean --if-exists --no-owner --dbname=\"\$TARGET_DATABASE_URL\" \"$OUT_FILE\""
echo ""
echo "Store this file somewhere durable and NOT in this git repo (it contains"
echo "real customer/venue data and password hashes) — e.g. a private cloud"
echo "storage bucket, or just off this machine entirely."
