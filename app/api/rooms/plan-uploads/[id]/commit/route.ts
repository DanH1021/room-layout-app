import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";
import { isConvexPolygon } from "@/lib/geometry/collision";
import { polygonBoundingBox } from "@/lib/geometry/room";

const commitSchema = z.object({
  venueName: z.string().min(1).max(200),
  roomName: z.string().min(1).max(200),
  ceilingHeightFt: z.number().positive().max(200).optional(),
  boundary: z.array(z.object({ x: z.number(), y: z.number() })).min(3).max(60), // inches
  obstacles: z
    .array(
      z.object({
        type: z.string(),
        shape: z.enum(["rect", "circle", "polygon"]),
        x: z.number().optional(),
        y: z.number().optional(),
        widthIn: z.number().positive().optional(),
        lengthIn: z.number().positive().optional(),
        diameterIn: z.number().positive().optional(),
        rotation: z.number().optional(),
        polygonPoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(), // inches
        blocksPlacement: z.boolean().default(true),
      })
    )
    .max(200),
});

/**
 * Commits a human-reviewed FloorPlanUpload into a real RoomTemplate +
 * RoomFeature rows. The request body is already resolved to real inches —
 * the review wizard does the normalized(0..1) -> image-px -> inch
 * conversion client-side (using the upload's stored pxPerInch from the
 * calibrate step) before submitting, so this route never needs to touch
 * backgroundImageWidthPx/HeightPx or pxPerInch itself for the conversion,
 * only to copy them onto the new RoomTemplate as the background-image
 * reference.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) {
    return forbidden("Only administrators and sales managers can commit floor-plan uploads.");
  }
  const { id } = await params;

  const upload = await prisma.floorPlanUpload.findUnique({ where: { id } });
  if (!upload || upload.orgId !== session.orgId) {
    return Response.json({ error: "Upload not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { venueName, roomName, ceilingHeightFt, boundary, obstacles } = parsed.data;

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.shape === "polygon") {
      if (!o.polygonPoints || o.polygonPoints.length < 3) {
        return Response.json(
          {
            error: `Obstacle #${i + 1} (${o.type}) needs at least 3 polygon points.`,
          },
          { status: 400 }
        );
      }
      if (!isConvexPolygon(o.polygonPoints)) {
        return Response.json(
          {
            error: `Obstacle #${i + 1} (${o.type}) is not a simple convex shape — try splitting it into two obstacles.`,
          },
          { status: 400 }
        );
      }
    }
  }

  const bbox = polygonBoundingBox(boundary);
  const widthFt = bbox.width / 12;
  const lengthFt = bbox.height / 12;

  const room = await prisma.$transaction(async (tx) => {
    const createdRoom = await tx.roomTemplate.create({
      data: {
        orgId: session.orgId,
        venueName,
        roomName,
        widthFt,
        lengthFt,
        ceilingHeightFt,
        boundaryJson: boundary,
        backgroundImageUrl: upload.backgroundImageUrl,
        backgroundImageWidthPx: upload.backgroundImageWidthPx,
        backgroundImageHeightPx: upload.backgroundImageHeightPx,
        backgroundImagePxPerInch: upload.pxPerInch,
      },
    });

    if (obstacles.length > 0) {
      await tx.roomFeature.createMany({
        data: obstacles.map((o) => ({
          roomTemplateId: createdRoom.id,
          type: o.type,
          shape: o.shape,
          x: o.x ?? 0,
          y: o.y ?? 0,
          widthIn: o.widthIn,
          lengthIn: o.lengthIn,
          diameterIn: o.diameterIn,
          rotation: o.rotation ?? 0,
          blocksPlacement: o.blocksPlacement,
          metadata: o.shape === "polygon" ? { polygonPoints: o.polygonPoints } : undefined,
        })),
      });
    }

    await tx.floorPlanUpload.update({
      where: { id },
      data: {
        roomTemplateId: createdRoom.id,
        finalBoundaryJson: boundary,
        finalObstaclesJson: obstacles,
        status: "confirmed",
      },
    });

    return createdRoom;
  });

  return Response.json({ room }, { status: 201 });
}
