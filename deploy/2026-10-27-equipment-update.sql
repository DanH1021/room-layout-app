-- Room Layout Program — equipment library update (Oct 2026).
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New query.
-- Safe to re-run: every change here is either idempotent (ALTER ... ADD
-- COLUMN IF NOT EXISTS / ON CONFLICT upserts) or a plain UPDATE.

-- Part 1: schema changes (mirrors prisma/migrations/20261027190000_add_equipment_chair_arrangement)
ALTER TABLE "EquipmentItem" ADD COLUMN IF NOT EXISTS "chairArrangement" TEXT;
ALTER TABLE "EquipmentItem" ADD COLUMN IF NOT EXISTS "hidden" BOOLEAN NOT NULL DEFAULT false;

-- Part 2: remove 60" rounds from the "Add Equipment" picker without
-- touching any layout that already placed one (hidden, not deleted).
UPDATE "EquipmentItem" SET "hidden" = true WHERE "id" = 'eq-round-60';

-- Part 3: new equipment items, upserted so this is safe to re-run.
INSERT INTO "EquipmentItem"
  ("id", "orgId", "name", "category", "shape", "widthIn", "lengthIn", "diameterIn", "defaultChairCount", "chairArrangement", "clearanceIn", "rotatable", "stackable", "color")
VALUES
  ('eq-round-72-8top', (SELECT "id" FROM "Organization" LIMIT 1), '72" Round Table (8-top)', 'table', 'circle', NULL, NULL, 72, 8, 'full', 24, true, true, '#c8a76b'),
  ('eq-round-72-crescent-6', (SELECT "id" FROM "Organization" LIMIT 1), '72" Round Table (6, crescent)', 'table', 'circle', NULL, NULL, 72, 6, 'crescent', 24, true, true, '#c8a76b'),
  ('eq-round-72-crescent-8', (SELECT "id" FROM "Organization" LIMIT 1), '72" Round Table (8, crescent)', 'table', 'circle', NULL, NULL, 72, 8, 'crescent', 24, true, true, '#c8a76b'),
  ('eq-round-72-bare', (SELECT "id" FROM "Organization" LIMIT 1), '72" Round Table (no chairs)', 'table', 'circle', NULL, NULL, 72, 0, NULL, 24, true, true, '#c8a76b'),
  ('eq-rect-8ft-bare', (SELECT "id" FROM "Organization" LIMIT 1), '8'' Banquet Table (no chairs)', 'table', 'rect', 30, 96, NULL, 0, NULL, 24, true, true, '#b58f57'),
  ('eq-rect-8ft-run3', (SELECT "id" FROM "Organization" LIMIT 1), '3 x 8'' Banquet Run (28 chairs)', 'table', 'rect', 30, 288, NULL, 28, NULL, 24, true, true, '#b58f57'),
  ('eq-rect-8ft-run2', (SELECT "id" FROM "Organization" LIMIT 1), '2 x 8'' Banquet Run (18 chairs)', 'table', 'rect', 30, 192, NULL, 18, NULL, 24, true, true, '#b58f57')
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "category" = EXCLUDED."category",
  "shape" = EXCLUDED."shape",
  "widthIn" = EXCLUDED."widthIn",
  "lengthIn" = EXCLUDED."lengthIn",
  "diameterIn" = EXCLUDED."diameterIn",
  "defaultChairCount" = EXCLUDED."defaultChairCount",
  "chairArrangement" = EXCLUDED."chairArrangement",
  "clearanceIn" = EXCLUDED."clearanceIn",
  "rotatable" = EXCLUDED."rotatable",
  "stackable" = EXCLUDED."stackable",
  "color" = EXCLUDED."color",
  "hidden" = false;
