-- AlterTable
ALTER TABLE "EquipmentItem" ADD COLUMN "chairArrangement" TEXT;
ALTER TABLE "EquipmentItem" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
