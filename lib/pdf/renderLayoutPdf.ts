import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from "pdf-lib";
import { EquipmentItem, LayoutObject } from "@/lib/geometry/types";
import { rectCorners } from "@/lib/geometry/collision";
import { computeCapacity } from "@/lib/geometry/capacity";

export interface PdfRoomData {
  venueName: string;
  roomName: string;
  widthFt: number;
  lengthFt: number;
  boundary: { x: number; y: number }[];
}

export interface PdfLayoutData {
  room: PdfRoomData;
  equipment: EquipmentItem[];
  objects: LayoutObject[];
  layoutName: string;
  eventName?: string;
  eventDateLabel?: string;
  guestCountTarget?: number;
  generatedAtLabel: string;
}

// Tabloid landscape (17in x 11in), in points (72pt = 1in) — big enough that a
// 60ft x 40ft ballroom still renders at a legible scale.
const PAGE_WIDTH = 17 * 72;
const PAGE_HEIGHT = 11 * 72;
const MARGIN = 36; // 0.5in
const SIDEBAR_WIDTH = 216; // 3in, for the legend/title block
const TITLE_HEIGHT = 54;

function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Vector-renders a layout at a stated, dimensionally-accurate scale — per
 * the architecture doc's explicit requirement, this re-draws the same
 * structured x/y/rotation/dimension data that drives the on-screen editor
 * directly as vector shapes, rather than screenshotting the canvas, so a
 * ruler held against the printed scale bar gives correct real-world
 * distances regardless of what page size the room happens to fit at.
 */
export async function renderLayoutPdf(data: PdfLayoutData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const roomWidthIn = data.room.widthFt * 12;
  const roomLengthIn = data.room.lengthFt * 12;

  const drawAreaWidthPt = PAGE_WIDTH - MARGIN * 2 - SIDEBAR_WIDTH - 18; // 18pt gutter before sidebar
  const drawAreaHeightPt = PAGE_HEIGHT - MARGIN * 2 - TITLE_HEIGHT;

  const scalePtPerIn = Math.min(drawAreaWidthPt / roomWidthIn, drawAreaHeightPt / roomLengthIn);

  // The page-space point where the room's own (0,0) — its top-left corner,
  // matching the editor's coordinate convention — lands. Every other point
  // is derived from this anchor plus the scale, so the whole drawing is one
  // consistent affine transform.
  const originX = MARGIN;
  const originY = PAGE_HEIGHT - MARGIN - TITLE_HEIGHT;

  const toPagePoint = (xIn: number, yIn: number) => ({
    x: originX + xIn * scalePtPerIn,
    y: originY - yIn * scalePtPerIn,
  });

  drawTitleBlock(page, font, fontBold, data);
  drawRoomBoundary(page, data.room, toPagePoint);
  drawEquipment(page, font, data.equipment, data.objects, toPagePoint, scalePtPerIn);
  drawScaleBar(page, font, fontBold, originX, MARGIN, scalePtPerIn);
  drawLegend(page, font, fontBold, data);

  return pdfDoc.save();
}

function drawTitleBlock(page: PDFPage, font: PDFFont, fontBold: PDFFont, data: PdfLayoutData) {
  const top = PAGE_HEIGHT - MARGIN;
  page.drawText(`${data.room.venueName} — ${data.room.roomName}`, {
    x: MARGIN,
    y: top - 16,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  const subtitleParts = [
    data.layoutName,
    data.eventName,
    `${data.room.widthFt}' × ${data.room.lengthFt}'`,
  ].filter(Boolean);
  page.drawText(subtitleParts.join("   •   "), {
    x: MARGIN,
    y: top - 33,
    size: 10,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText(`Generated ${data.generatedAtLabel}`, {
    x: MARGIN,
    y: top - 47,
    size: 8,
    font,
    color: rgb(0.55, 0.55, 0.55),
  });
  page.drawLine({
    start: { x: MARGIN, y: top - 52 },
    end: { x: PAGE_WIDTH - MARGIN, y: top - 52 },
    thickness: 0.75,
    color: rgb(0.7, 0.7, 0.7),
  });
}

function drawRoomBoundary(
  page: PDFPage,
  room: PdfRoomData,
  toPagePoint: (x: number, y: number) => { x: number; y: number }
) {
  const points = room.boundary.map((p) => toPagePoint(p.x, p.y));
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    page.drawLine({ start: a, end: b, thickness: 1.5, color: rgb(0.15, 0.15, 0.15) });
  }
}

function drawEquipment(
  page: PDFPage,
  font: PDFFont,
  equipment: EquipmentItem[],
  objects: LayoutObject[],
  toPagePoint: (x: number, y: number) => { x: number; y: number },
  scalePtPerIn: number
) {
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const parents = objects.filter((o) => !o.parentObjectId);
  const childrenByParent = new Map<string, LayoutObject[]>();
  for (const o of objects) {
    if (o.parentObjectId) {
      const list = childrenByParent.get(o.parentObjectId) ?? [];
      list.push(o);
      childrenByParent.set(o.parentObjectId, list);
    }
  }

  for (const parent of parents) {
    const item = equipmentById.get(parent.equipmentItemId);
    if (!item) continue;
    drawShape(page, parent, item, toPagePoint, scalePtPerIn);

    for (const child of childrenByParent.get(parent.id) ?? []) {
      const childItem = equipmentById.get(child.equipmentItemId);
      if (!childItem) continue;
      // Children are stored relative to the parent's local origin — rotate
      // and translate into absolute room coordinates before drawing, same
      // transform the editor's Konva Group applies visually.
      const rad = (parent.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const absoluteChild: LayoutObject = {
        ...child,
        x: parent.x + child.x * cos - child.y * sin,
        y: parent.y + child.x * sin + child.y * cos,
        rotation: child.rotation + parent.rotation,
      };
      drawShape(page, absoluteChild, childItem, toPagePoint, scalePtPerIn);
    }

    // Label large-enough tables with their equipment name.
    const labelWidthIn = item.shape === "circle" ? item.diameterIn ?? 0 : item.widthIn ?? 0;
    if (labelWidthIn * scalePtPerIn > 40) {
      const center = toPagePoint(parent.x, parent.y);
      const fontSize = 7;
      const textWidth = font.widthOfTextAtSize(item.name, fontSize);
      page.drawText(item.name, {
        x: center.x - textWidth / 2,
        y: center.y - fontSize / 2,
        size: fontSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
    }
  }
}

function drawShape(
  page: PDFPage,
  object: LayoutObject,
  item: EquipmentItem,
  toPagePoint: (x: number, y: number) => { x: number; y: number },
  scalePtPerIn: number
) {
  const color = hexToRgb(item.color);

  if (object.shape === "circle") {
    const diameterIn = object.diameterIn ?? item.diameterIn ?? 24;
    const center = toPagePoint(object.x, object.y);
    page.drawEllipse({
      x: center.x,
      y: center.y,
      xScale: (diameterIn / 2) * scalePtPerIn,
      yScale: (diameterIn / 2) * scalePtPerIn,
      color,
      borderColor: rgb(0.15, 0.15, 0.15),
      borderWidth: 0.75,
    });
    return;
  }

  const widthIn = object.widthIn ?? item.widthIn ?? 18;
  const lengthIn = object.lengthIn ?? item.lengthIn ?? 18;
  // rectCorners() operates in the same y-down, degrees-clockwise convention
  // as the room/inches coordinate system used everywhere else in the app.
  const corners = rectCorners({ cx: object.x, cy: object.y, width: widthIn, height: lengthIn, rotation: object.rotation });
  const pagePoints = corners.map((c) => toPagePoint(c.x, c.y));
  // The path coordinates above are already absolute page points, so anchor
  // the SVG draw at the page origin (0,0) and let pdf-lib's mandatory
  // y-flip-for-SVG cancel out — verified empirically before writing this,
  // since pdf-lib's actual flip behavior isn't obvious from its docs alone.
  page.drawSvgPath(pathFlippedForPdfLib(pagePoints), {
    x: 0,
    y: 0,
    color,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 0.75,
  });
}

/**
 * pdf-lib's drawSvgPath always applies a y-flip internally (SVG convention
 * is y-down; PDF page space is y-up) — confirmed empirically, since this
 * isn't spelled out in the public docs. We already have absolute, correct
 * PDF-page-space points (y-up) computed via toPagePoint; negating y here
 * cancels pdf-lib's flip back out so the shape lands exactly where those
 * points say it should.
 */
function pathFlippedForPdfLib(points: { x: number; y: number }[]): string {
  return `M ${points.map((p) => `${p.x.toFixed(2)},${-p.y.toFixed(2)}`).join(" L ")} Z`;
}

function drawScaleBar(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  originX: number,
  bottomMargin: number,
  scalePtPerIn: number
) {
  const barFeet = 10;
  const barLengthPt = barFeet * 12 * scalePtPerIn;
  const y = bottomMargin + 10;
  const x0 = originX;
  const x1 = x0 + barLengthPt;

  page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
  for (let ft = 0; ft <= barFeet; ft += ft === 0 || ft === barFeet ? barFeet : 5) {
    const tickX = x0 + ft * 12 * scalePtPerIn;
    page.drawLine({
      start: { x: tickX, y: y - 4 },
      end: { x: tickX, y: y + 4 },
      thickness: 1.5,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  page.drawText("0", { x: x0 - 2, y: y + 6, size: 7, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`${barFeet} ft`, { x: x1 - 8, y: y + 6, size: 7, font, color: rgb(0.2, 0.2, 0.2) });

  const realFeetPerPaperInch = 72 / scalePtPerIn / 12;
  page.drawText(`Scale: 1 in ~ ${realFeetPerPaperInch.toFixed(1)} ft (verify against bar above when printed)`, {
    x: x0,
    y: bottomMargin - 6,
    size: 7,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
}

function drawLegend(page: PDFPage, font: PDFFont, fontBold: PDFFont, data: PdfLayoutData) {
  const x = PAGE_WIDTH - MARGIN - SIDEBAR_WIDTH;
  let y = PAGE_HEIGHT - MARGIN - TITLE_HEIGHT;

  page.drawText("Legend", { x, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;

  const equipmentById = new Map(data.equipment.map((e) => [e.id, e]));
  const parents = data.objects.filter((o) => !o.parentObjectId);
  const countByEquipment = new Map<string, number>();
  for (const p of parents) {
    countByEquipment.set(p.equipmentItemId, (countByEquipment.get(p.equipmentItemId) ?? 0) + 1);
  }

  for (const [equipmentId, count] of countByEquipment.entries()) {
    const item = equipmentById.get(equipmentId);
    if (!item || item.category === "chair") continue; // chairs are summarized as total seats below
    const swatchColor = hexToRgb(item.color);
    page.drawRectangle({ x, y: y - 8, width: 10, height: 10, color: swatchColor, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.5 });
    page.drawText(`${item.name}  ×${count}`, { x: x + 16, y: y - 6, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 16;
  }

  y -= 8;
  const totalSeats = computeCapacity(data.objects, (id) => {
    const item = equipmentById.get(id);
    if (!item) throw new Error(`Unknown equipment id: ${id}`);
    return item;
  });
  page.drawText(`Total seats: ${totalSeats}`, { x, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 14;
  if (data.guestCountTarget) {
    const diff = totalSeats - data.guestCountTarget;
    const diffLabel = diff === 0 ? "matches target" : diff > 0 ? `${diff} over target` : `${-diff} under target`;
    page.drawText(`Guest target: ${data.guestCountTarget} (${diffLabel})`, {
      x,
      y,
      size: 9,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }
}
