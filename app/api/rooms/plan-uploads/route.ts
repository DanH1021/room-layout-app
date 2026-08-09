import { NextRequest } from "next/server";
import { imageSize } from "image-size";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/getSession";
import { canManageOrgSettings, forbidden } from "@/lib/auth/roles";
import { uploadFile } from "@/lib/storage/blob";
import { rasterizePdfFirstPage } from "@/lib/pdf/rasterizePlan";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Accepts a raw floor-plan file (PDF or image), uploads it (and, for PDFs, a
 * rasterized PNG of page 1) to blob storage, and creates a FloorPlanUpload
 * row for the AI-parsing step (see [id]/parse/route.ts) to pick up next.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (!canManageOrgSettings(session.role)) {
    return forbidden("Only administrators and sales managers can upload floor plans.");
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing 'file' field." }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return Response.json(
      { error: `Unsupported file type '${file.type}'. Allowed: application/pdf, image/png, image/jpeg.` },
      { status: 415 }
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "File is too large. Maximum size is 15MB." }, { status: 413 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const isPdf = file.type === "application/pdf";
  const fileType: "pdf" | "image" = isPdf ? "pdf" : "image";

  const originalPathname = `floor-plans/original/${crypto.randomUUID()}-${file.name}`;
  const { url: originalFileUrl } = await uploadFile(originalPathname, buffer, file.type);

  let backgroundImageUrl: string;
  let widthPx: number;
  let heightPx: number;

  if (isPdf) {
    const { png, widthPx: w, heightPx: h } = await rasterizePdfFirstPage(buffer);
    const bgPathname = `floor-plans/background/${crypto.randomUUID()}.png`;
    const uploaded = await uploadFile(bgPathname, png, "image/png");
    backgroundImageUrl = uploaded.url;
    widthPx = w;
    heightPx = h;
  } else {
    const dims = imageSize(new Uint8Array(buffer));
    if (!dims.width || !dims.height) {
      return Response.json({ error: "Couldn't read image dimensions from the uploaded file." }, { status: 400 });
    }
    backgroundImageUrl = originalFileUrl;
    widthPx = dims.width;
    heightPx = dims.height;
  }

  const upload = await prisma.floorPlanUpload.create({
    data: {
      orgId: session.orgId,
      uploadedBy: session.userId,
      originalFileUrl,
      originalFileType: fileType,
      backgroundImageUrl,
      backgroundImageWidthPx: widthPx,
      backgroundImageHeightPx: heightPx,
      status: "uploaded",
    },
  });

  return Response.json(
    {
      uploadId: upload.id,
      backgroundImageUrl,
      widthPx,
      heightPx,
      fileType,
    },
    { status: 201 }
  );
}
