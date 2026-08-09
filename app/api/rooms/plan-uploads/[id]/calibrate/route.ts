import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";
import { pxPerInchFromScaleNote, pxPerInchFromCalibrationLine } from "@/lib/geometry/scaleCalibration";

const calibrateSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("scale_note"), drawnInchesPerRealFoot: z.number().positive() }),
  z.object({
    method: z.literal("manual_line"),
    p1: z.object({ x: z.number(), y: z.number() }),
    p2: z.object({ x: z.number(), y: z.number() }),
    realWorldInches: z.number().positive(),
  }),
]);

/**
 * Resolves a FloorPlanUpload's pxPerInch — either from a printed scale note
 * (PDF uploads only, since only a PDF's rasterization DPI is deterministic
 * enough to trust) or from a manually-drawn calibration line (either file
 * type).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) {
    return forbidden("Only administrators and sales managers can calibrate floor-plan uploads.");
  }
  const { id } = await params;

  const upload = await prisma.floorPlanUpload.findUnique({ where: { id } });
  if (!upload || upload.orgId !== session.orgId) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = calibrateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.method === "scale_note" && upload.originalFileType !== "pdf") {
    return Response.json(
      {
        error:
          "Scale-note calibration only works for PDF uploads, which are rasterized at a fixed, known DPI. Plain image uploads (photos/screenshots) have no reliable page-to-pixel ratio, even if a scale note is visible in the image — use manual_line calibration instead.",
      },
      { status: 400 }
    );
  }

  const pxPerInch =
    data.method === "scale_note"
      ? pxPerInchFromScaleNote(data.drawnInchesPerRealFoot)
      : pxPerInchFromCalibrationLine(data.p1, data.p2, data.realWorldInches);

  if (!Number.isFinite(pxPerInch) || pxPerInch <= 0) {
    return Response.json(
      { error: "Calibration produced an invalid scale (are the two points identical?)." },
      { status: 400 }
    );
  }

  const updated = await prisma.floorPlanUpload.update({
    where: { id },
    data: {
      calibrationMethod: data.method,
      calibrationLineJson:
        data.method === "manual_line"
          ? { p1: data.p1, p2: data.p2, realWorldInches: data.realWorldInches }
          : Prisma.JsonNull,
      pxPerInch,
      status: "calibrated",
      errorMessage: null,
    },
  });

  return Response.json({ upload: updated });
}
