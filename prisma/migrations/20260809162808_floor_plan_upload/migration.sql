-- AlterTable: RoomTemplate gains background-image fields for the
-- floor-plan-upload feature (shown under the traced boundary in the editor).
ALTER TABLE "RoomTemplate"
  ADD COLUMN "backgroundImageUrl" TEXT,
  ADD COLUMN "backgroundImageWidthPx" DOUBLE PRECISION,
  ADD COLUMN "backgroundImageHeightPx" DOUBLE PRECISION,
  ADD COLUMN "backgroundImagePxPerInch" DOUBLE PRECISION;

-- AlterTable: RoomFeature becomes a real obstacle table (previously
-- unreferenced anywhere in the app). Existing rows (there are none in
-- production yet) get safe defaults.
ALTER TABLE "RoomFeature"
  ADD COLUMN "shape" TEXT NOT NULL DEFAULT 'rect',
  ADD COLUMN "diameterIn" DOUBLE PRECISION,
  ADD COLUMN "blocksPlacement" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FloorPlanUpload" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "roomTemplateId" TEXT,
    "originalFileUrl" TEXT NOT NULL,
    "originalFileType" TEXT NOT NULL,
    "backgroundImageUrl" TEXT,
    "backgroundImageWidthPx" DOUBLE PRECISION,
    "backgroundImageHeightPx" DOUBLE PRECISION,
    "aiRawResponseJson" JSONB,
    "aiScaleConfidence" TEXT,
    "calibrationMethod" TEXT,
    "calibrationLineJson" JSONB,
    "pxPerInch" DOUBLE PRECISION,
    "proposedBoundaryJson" JSONB,
    "proposedObstaclesJson" JSONB,
    "finalBoundaryJson" JSONB,
    "finalObstaclesJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorPlanUpload_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FloorPlanUpload" ADD CONSTRAINT "FloorPlanUpload_roomTemplateId_fkey" FOREIGN KEY ("roomTemplateId") REFERENCES "RoomTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
