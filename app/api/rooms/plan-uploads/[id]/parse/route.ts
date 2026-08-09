import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";
import { parseFloorPlan } from "@/lib/ai/parseFloorPlan";

const MIME_BY_FILE_TYPE: Record<string, "application/pdf" | "image/png" | "image/jpeg"> = {
  pdf: "application/pdf",
  // Uploads store originalFileType as "pdf" | "image" — we don't persist the
  // exact image mime type, but PNG vs JPEG only matters for the Anthropic
  // API's content-block media_type, and both decode identically for our
  // purposes, so PNG is a safe default; see note below where we re-derive it
  // from the file's magic bytes for accuracy instead of guessing.
  image: "image/png",
};

/** Sniffs PNG vs JPEG from magic bytes, since FloorPlanUpload only stores the coarse "image" file type. */
function sniffImageMimeType(buffer: Buffer): "image/png" | "image/jpeg" {
  const isPng =
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  return isPng ? "image/png" : "image/jpeg";
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) {
    return forbidden("Only administrators and sales managers can parse floor-plan uploads.");
  }
  const { id } = await params;

  const upload = await prisma.floorPlanUpload.findUnique({ where: { id } });
  if (!upload || upload.orgId !== session.orgId) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  await prisma.floorPlanUpload.update({ where: { id }, data: { status: "parsing", errorMessage: null } });

  try {
    const fileRes = await fetch(upload.originalFileUrl);
    if (!fileRes.ok) {
      throw new Error(`Couldn't re-fetch the original file from storage (${fileRes.status}).`);
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const mimeType =
      upload.originalFileType === "pdf" ? MIME_BY_FILE_TYPE.pdf : sniffImageMimeType(buffer);

    const result = await parseFloorPlan(buffer, mimeType);

    const updated = await prisma.floorPlanUpload.update({
      where: { id },
      data: {
        proposedBoundaryJson: result.boundaryPoints,
        proposedObstaclesJson: result.obstacles,
        aiRawResponseJson: result,
        aiScaleConfidence: result.scaleNote.confidence,
        status: "parsed",
      },
    });

    return Response.json({ upload: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error while parsing the floor plan.";
    await prisma.floorPlanUpload.update({
      where: { id },
      data: { status: "failed", errorMessage: message },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
