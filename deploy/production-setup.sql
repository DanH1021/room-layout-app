-- Room Layout Program — production database setup for Supabase SQL Editor.
-- Run this ONCE, top to bottom, in Supabase Dashboard -> SQL Editor -> New query.
-- Safe to re-run: table creation is skipped if tables already exist is NOT
-- true for plain CREATE TABLE, so only run this a single time on a fresh
-- database. If you need to re-run just the seed section, use the ON
-- CONFLICT clauses in Part 2 (they're written as upserts).

-- ============================================================
-- PART 1: Schema (from prisma/migrations/20260809005640_init
-- and prisma/migrations/20260809015538_add_user_password_hash)
-- ============================================================

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'salesperson',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordHash" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "widthIn" DOUBLE PRECISION,
    "lengthIn" DOUBLE PRECISION,
    "diameterIn" DOUBLE PRECISION,
    "defaultChairCount" INTEGER,
    "clearanceIn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotatable" BOOLEAN NOT NULL DEFAULT true,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "iconUrl" TEXT,
    "inventoryQty" INTEGER,
    "notes" TEXT,
    "color" TEXT NOT NULL DEFAULT '#c8a76b',

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "widthFt" DOUBLE PRECISION NOT NULL,
    "lengthFt" DOUBLE PRECISION NOT NULL,
    "ceilingHeightFt" DOUBLE PRECISION,
    "boundaryJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomFeature" (
    "id" TEXT NOT NULL,
    "roomTemplateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "widthIn" DOUBLE PRECISION,
    "lengthIn" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "RoomFeature_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "roomTemplateId" TEXT NOT NULL,
    "guestCountTarget" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Layout" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "guestCount" INTEGER,
    "seatingStyle" TEXT,
    "createdBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayoutObject" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "equipmentItemId" TEXT,
    "parentObjectId" TEXT,
    "shape" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "widthIn" DOUBLE PRECISION,
    "lengthIn" DOUBLE PRECISION,
    "diameterIn" DOUBLE PRECISION,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,

    CONSTRAINT "LayoutObject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayoutIssue" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LayoutIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIInteractionLog" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "structuredResponseJson" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteractionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomTemplate" ADD CONSTRAINT "RoomTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomFeature" ADD CONSTRAINT "RoomFeature_roomTemplateId_fkey" FOREIGN KEY ("roomTemplateId") REFERENCES "RoomTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_roomTemplateId_fkey" FOREIGN KEY ("roomTemplateId") REFERENCES "RoomTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Layout" ADD CONSTRAINT "Layout_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayoutObject" ADD CONSTRAINT "LayoutObject_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayoutIssue" ADD CONSTRAINT "LayoutIssue_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AIInteractionLog" ADD CONSTRAINT "AIInteractionLog_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "Layout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Also record these two migrations as "applied" in Prisma's own bookkeeping
-- table, so a future `npx prisma migrate deploy` (e.g. from Vercel, or from
-- your own machine) doesn't try to re-run them and fail on "already exists."
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                      VARCHAR(36) PRIMARY KEY,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text, 'manual-sql-editor-run', now(), '20260809005640_init', now(), 1),
  (gen_random_uuid()::text, 'manual-sql-editor-run', now(), '20260809015538_add_user_password_hash', now(), 1);

-- ============================================================
-- PART 2: Seed data (org, admin login, equipment library, one
-- starter room) — matches prisma/seed.ts, upsert-style so it's
-- safe to re-run.
-- ============================================================

INSERT INTO "Organization" (id, name) VALUES
  ('org-great-plains', 'Great Plains Hospitality')
ON CONFLICT (id) DO NOTHING;

-- Admin login: dan.hurder@greatplainshospitality.com
-- Password hash below was generated with the exact same scrypt function
-- the app uses (lib/auth/password.ts) for the password: OrC4tuGDpvGzSAS8
-- Log in with that password, then change it immediately at /account.
INSERT INTO "User" (id, "orgId", email, name, role, "passwordHash") VALUES
  (gen_random_uuid()::text, 'org-great-plains', 'dan.hurder@greatplainshospitality.com', 'Dan Hurder', 'administrator',
   '7388a47e696964c862ee44e0f5acc3f4:6dbc1ef91f9d01fd512516f2d95a69fca34ed84f435ad82b622ab1df61ba4563b9d627983ccdaf6538d9a50e2e9e67a855b8efb52d8dfaab435e615b8053ac2b')
ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash";

INSERT INTO "RoomTemplate" (id, "orgId", "venueName", "roomName", "widthFt", "lengthFt", "ceilingHeightFt", "boundaryJson") VALUES
  ('room-test-ballroom', 'org-great-plains', 'Great Plains Hospitality', 'Grand Ballroom (Test Room)', 60, 40, 16,
   '[{"x":0,"y":0},{"x":720,"y":0},{"x":720,"y":480},{"x":0,"y":480}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "EquipmentItem" (id, "orgId", name, category, shape, "widthIn", "lengthIn", "diameterIn", "defaultChairCount", "clearanceIn", rotatable, color) VALUES
  ('eq-round-60', 'org-great-plains', '60" Round Table (8-top)', 'table', 'circle', NULL, NULL, 60, 8, 24, true, '#c8a76b'),
  ('eq-round-72', 'org-great-plains', '72" Round Table (10-top)', 'table', 'circle', NULL, NULL, 72, 10, 24, true, '#c8a76b'),
  ('eq-rect-6ft', 'org-great-plains', '6'' Banquet Table (rect)', 'table', 'rect', 30, 72, NULL, 8, 24, true, '#b58f57'),
  ('eq-rect-8ft', 'org-great-plains', '8'' Banquet Table (rect)', 'table', 'rect', 30, 96, NULL, 10, 24, true, '#b58f57'),
  ('eq-chair', 'org-great-plains', 'Banquet Chair', 'chair', 'rect', 18, 20, NULL, NULL, 6, true, '#5b7a9d'),
  ('eq-highboy', 'org-great-plains', '30" Highboy Cocktail Table', 'table', 'circle', NULL, NULL, 30, 0, 18, false, '#c8a76b'),
  ('eq-bar-6ft', 'org-great-plains', '6'' Straight Bar', 'bar', 'rect', 24, 72, NULL, NULL, 36, true, '#7a5c3e'),
  ('eq-stage-8x8', 'org-great-plains', '8'' x 8'' Stage Deck', 'stage', 'rect', 96, 96, NULL, NULL, 0, true, '#8a8a8a'),
  ('eq-dancefloor-3x3', 'org-great-plains', '3'' x 3'' Dance Floor Panel', 'dance_floor', 'rect', 36, 36, NULL, NULL, 0, false, '#d9d2c4')
ON CONFLICT (id) DO NOTHING;

-- Done. Verify with:
-- SELECT email, name, role FROM "User";
