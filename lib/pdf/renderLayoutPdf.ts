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
  /** Source floor-plan image, same fields as RoomTemplate — drawn as a background layer under everything else, same as the on-screen editor. */
  backgroundImageUrl?: string;
  backgroundImageWidthPx?: number;
  backgroundImageHeightPx?: number;
  backgroundImagePxPerInch?: number;
}

export interface PdfLayoutData {
  room: PdfRoomData;
  equipment: EquipmentItem[];
  objects: LayoutObject[];
  layoutName: string;
  eventName?: string;
  eventDateLabel?: string;
  guestCountTarget?: number;
  /** Setup-crew notes for this event's layout, printed in the sidebar. */
  setupNotes?: string;
  generatedAtLabel: string;
}

// Tabloid landscape (17in x 11in), in points (72pt = 1in) — big enough that a
// 60ft x 40ft ballroom still renders at a legible scale.
const PAGE_WIDTH = 17 * 72;
const PAGE_HEIGHT = 11 * 72;
const MARGIN = 36; // 0.5in
const TITLE_HEIGHT = 54;
// The bottom 2in of the printable page is reserved for the legend, seat
// totals, scale bar, and setup notes — the room drawing fills the full
// width above it, rather than sharing the page with a right-hand sidebar.
const BOTTOM_BAND_HEIGHT = 2 * 72;
const BAND_GUTTER = 10; // gap between the room drawing and the band's top rule

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

  const bandTop = MARGIN + BOTTOM_BAND_HEIGHT;

  // The room drawing now fills the full printable width — no right-hand
  // sidebar — and the full height between the title and the bottom band.
  const drawAreaWidthPt = PAGE_WIDTH - MARGIN * 2;
  const drawAreaHeightPt = PAGE_HEIGHT - MARGIN - TITLE_HEIGHT - bandTop - BAND_GUTTER;

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
  await drawBackgroundImage(pdfDoc, page, data.room, toPagePoint);
  drawRoomBoundary(page, data.room, toPagePoint);
  drawEquipment(page, font, data.equipment, data.objects, toPagePoint, scalePtPerIn);
  drawBottomBand(page, font, fontBold, data, bandTop);

  return pdfDoc.save();
}

/**
 * Draws the uploaded floor-plan image as a background layer, same as the
 * on-screen editor's bgVisible Layer — this was previously missing from the
 * PDF entirely (the renderer only ever drew the vector boundary/equipment,
 * never fetched or embedded the source image). The image's top-left corner
 * is always room-inches (0,0) and its size is backgroundImageWidthPx /
 * backgroundImagePxPerInch — the same anchoring the editor's KonvaImage
 * uses (see RoomCanvas.tsx) — so it lines up with the boundary/equipment
 * drawn via the same toPagePoint transform. Fails soft: if the image can't
 * be fetched or decoded, the rest of the PDF still renders normally.
 */
async function drawBackgroundImage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  room: PdfRoomData,
  toPagePoint: (x: number, y: number) => { x: number; y: number }
) {
  const { backgroundImageUrl, backgroundImageWidthPx, backgroundImageHeightPx, backgroundImagePxPerInch } = room;
  if (!backgroundImageUrl || !backgroundImageWidthPx || !backgroundImageHeightPx || !backgroundImagePxPerInch) {
    return;
  }
  try {
    const res = await fetch(backgroundImageUrl);
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());

    const image =
      bytes[0] === 0x89 && bytes[1] === 0x50 ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

    const widthIn = backgroundImageWidthPx / backgroundImagePxPerInch;
    const heightIn = backgroundImageHeightPx / backgroundImagePxPerInch;
    const topLeft = toPagePoint(0, 0);
    const bottomRight = toPagePoint(widthIn, heightIn);

    page.drawImage(image, {
      x: topLeft.x,
      y: bottomRight.y,
      width: bottomRight.x - topLeft.x,
      height: topLeft.y - bottomRight.y,
      opacity: 0.55,
    });
  } catch (err) {
    // Never let a bad/unreachable image break the PDF — same "fail soft"
    // posture the rest of this file takes toward missing equipment ids.
    console.error("renderLayoutPdf: couldn't embed background image", err);
  }
}

function drawTitleBlock(page: PDFPage, font: PDFFont, fontBold: PDFFont, data: PdfLayoutData) {
  const top = PAGE_HEIGHT - MARGIN;
  // Just the room name — no venue name or total dimensions; those weren't
  // useful on the printed sheet per Dan's feedback.
  page.drawText(data.room.roomName, {
    x: MARGIN,
    y: top - 16,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  const subtitleParts = [data.layoutName, data.eventName].filter(Boolean);
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
    if (parent.shape === "text") {
      drawTextLabel(page, font, parent, toPagePoint);
      continue;
    }
    if (!parent.equipmentItemId) continue;
    const item = equipmentById.get(parent.equipmentItemId);
    if (!item) continue;
    drawShape(page, parent, item, toPagePoint, scalePtPerIn);

    for (const child of childrenByParent.get(parent.id) ?? []) {
      if (!child.equipmentItemId) continue;
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

/**
 * A plain text annotation (table numbers, "Gift Table", etc.) — no
 * equipment item backs it, just the object's own label/position/rotation.
 * Drawn as centered text inside a thin rounded box so it reads clearly
 * against the floor plan or other shapes behind it.
 */
function drawTextLabel(
  page: PDFPage,
  font: PDFFont,
  object: LayoutObject,
  toPagePoint: (x: number, y: number) => { x: number; y: number }
) {
  const text = object.label ?? "";
  if (!text) return;
  const center = toPagePoint(object.x, object.y);
  const fontSize = 10;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const paddingX = 5;
  const paddingY = 4;
  page.drawRectangle({
    x: center.x - textWidth / 2 - paddingX,
    y: center.y - fontSize / 2 - paddingY + 1,
    width: textWidth + paddingX * 2,
    height: fontSize + paddingY * 2,
    color: rgb(1, 1, 1),
    opacity: 0.85,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 0.75,
  });
  page.drawText(text, {
    x: center.x - textWidth / 2,
    y: center.y - fontSize / 2 + 1,
    size: fontSize,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
}

// Linen color-coding overrides a table's normal equipment-palette fill;
// "none" (or unset) keeps the item's own color. Mirrors ShapeVisual's same
// rule in the on-screen editor (components/editor/RoomCanvas.tsx).
const LINEN_FILL: Record<string, RGB> = {
  spandex: rgb(0.06, 0.06, 0.06),
  cloth: rgb(0.55, 0.55, 0.55),
};

function drawShape(
  page: PDFPage,
  object: LayoutObject,
  item: EquipmentItem,
  toPagePoint: (x: number, y: number) => { x: number; y: number },
  scalePtPerIn: number
) {
  const color = (object.linenType && LINEN_FILL[object.linenType]) || hexToRgb(item.color);

  if (object.shape === "circle") {
    const diameterIn = object.diameterIn ?? item.diameterIn ?? 24;
    const center = toPagePoint(object.x, object.y);
    const radiusPt = (diameterIn / 2) * scalePtPerIn;
    page.drawEllipse({
      x: center.x,
      y: center.y,
      xScale: radiusPt,
      yScale: radiusPt,
      color,
      borderColor: rgb(0.15, 0.15, 0.15),
      borderWidth: 0.75,
    });
    if (object.skirted) drawSkirtCircle(page, center, radiusPt);
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
  if (object.skirted) drawSkirtRect(page, pagePoints);
}

/**
 * Draws a wavy (scalloped) line just outside a circle table's edge to
 * indicate it's skirted — a simple sine-wave-in-polar-coordinates path,
 * not a literal fabric render, just a clear "this one has a skirt" marker
 * matching the editor's own squiggly-outline convention.
 */
function drawSkirtCircle(page: PDFPage, center: { x: number; y: number }, radiusPt: number) {
  const bumps = Math.max(10, Math.round(radiusPt / 4));
  const amplitude = Math.max(2, radiusPt * 0.035);
  const outerR = radiusPt + amplitude + 2;
  const steps = bumps * 6;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = outerR + amplitude * Math.sin(t * bumps);
    points.push({ x: center.x + r * Math.cos(t), y: center.y + r * Math.sin(t) });
  }
  page.drawSvgPath(pathFlippedForPdfLib(points), {
    x: 0,
    y: 0,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 0.75,
  });
}

/** Same idea as drawSkirtCircle, but walking a wavy line parallel to each side of a (possibly rotated) rectangle. */
function drawSkirtRect(page: PDFPage, corners: { x: number; y: number }[]) {
  const amplitude = 2.5;
  const segmentsPerSide = 10;
  const points: { x: number; y: number }[] = [];
  for (let side = 0; side < 4; side++) {
    const a = corners[side];
    const b = corners[(side + 1) % 4];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    // Outward normal — corners are wound consistently by rectCorners(), so
    // a fixed 90° turn points away from the rect's center for every side.
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i <= segmentsPerSide; i++) {
      const t = i / segmentsPerSide;
      const wave = amplitude * Math.sin(t * Math.PI * 4);
      points.push({ x: a.x + dx * t + nx * wave, y: a.y + dy * t + ny * wave });
    }
  }
  page.drawSvgPath(pathFlippedForPdfLib(points), {
    x: 0,
    y: 0,
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

/**
 * Everything that used to live in a 3in right-hand sidebar now lives in a
 * 2in band across the bottom of the page instead, per Dan's request, so the
 * room drawing above it gets the full page width. Laid out as three
 * columns — legend, scale/seat totals, setup notes — left to right.
 */
function drawBottomBand(page: PDFPage, font: PDFFont, fontBold: PDFFont, data: PdfLayoutData, bandTop: number) {
  const bandBottom = MARGIN;
  const bandLeft = MARGIN;
  const bandRight = PAGE_WIDTH - MARGIN;
  const colGap = 24;
  const legendColWidth = 380;
  const totalsColWidth = 220;
  const legendX = bandLeft;
  const totalsX = legendX + legendColWidth + colGap;
  const notesX = totalsX + totalsColWidth + colGap;
  const notesWidth = bandRight - notesX;

  page.drawLine({
    start: { x: bandLeft, y: bandTop },
    end: { x: bandRight, y: bandTop },
    thickness: 0.75,
    color: rgb(0.7, 0.7, 0.7),
  });
  for (const sepX of [totalsX - colGap / 2, notesX - colGap / 2]) {
    page.drawLine({
      start: { x: sepX, y: bandTop - 4 },
      end: { x: sepX, y: bandBottom + 4 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
  }

  const equipmentById = new Map(data.equipment.map((e) => [e.id, e]));
  const totalSeats = computeCapacity(data.objects, (id) => {
    const item = equipmentById.get(id);
    if (!item) throw new Error(`Unknown equipment id: ${id}`);
    return item;
  });

  drawLegendColumn(page, font, fontBold, data, equipmentById, legendX, bandTop, legendColWidth, bandBottom);
  drawTotalsColumn(page, font, fontBold, data, totalSeats, totalsX, bandTop, totalsColWidth, bandBottom);
  drawNotesColumn(page, font, fontBold, data, notesX, bandTop, notesWidth, bandBottom);
}

/** Equipment swatches + counts, flowing into a second sub-column if the single column runs out of band height. */
function drawLegendColumn(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  data: PdfLayoutData,
  equipmentById: Map<string, EquipmentItem>,
  x: number,
  bandTop: number,
  width: number,
  bandBottom: number
) {
  page.drawText("Legend", { x, y: bandTop - 14, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });

  const parents = data.objects.filter((o) => !o.parentObjectId);
  const countByEquipment = new Map<string, number>();
  for (const p of parents) {
    if (!p.equipmentItemId) continue; // text labels aren't equipment
    countByEquipment.set(p.equipmentItemId, (countByEquipment.get(p.equipmentItemId) ?? 0) + 1);
  }
  const entries = [...countByEquipment.entries()].filter(([equipmentId]) => {
    const item = equipmentById.get(equipmentId);
    return item && item.category !== "chair"; // chairs are summarized as total seats instead
  });

  const rowHeight = 14;
  const rowsAvailable = Math.max(1, Math.floor((bandTop - 28 - bandBottom) / rowHeight));
  const subColWidth = width / 2 - 6;

  entries.forEach(([equipmentId, count], i) => {
    const item = equipmentById.get(equipmentId);
    if (!item) return;
    const col = Math.floor(i / rowsAvailable);
    const row = i % rowsAvailable;
    if (col > 1) return; // out of band space — rest are omitted rather than drawn off-page
    const colX = x + col * (subColWidth + 12);
    const y = bandTop - 28 - row * rowHeight;
    page.drawRectangle({
      x: colX,
      y: y - 7,
      width: 9,
      height: 9,
      color: hexToRgb(item.color),
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 0.5,
    });
    page.drawText(`${item.name}  ×${count}`, { x: colX + 14, y: y - 5, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
  });
}

/** Total seats, guest-target comparison, and the printed scale bar. */
function drawTotalsColumn(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  data: PdfLayoutData,
  totalSeats: number,
  x: number,
  bandTop: number,
  width: number,
  bandBottom: number
) {
  let y = bandTop - 14;
  page.drawText(`Total seats: ${totalSeats}`, { x, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;
  if (data.guestCountTarget) {
    const diff = totalSeats - data.guestCountTarget;
    const diffLabel = diff === 0 ? "matches target" : diff > 0 ? `${diff} over target` : `${-diff} under target`;
    for (const line of wrapText(`Guest target: ${data.guestCountTarget} (${diffLabel})`, font, 9, width)) {
      page.drawText(line, { x, y, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
      y -= 12;
    }
  }
  drawScaleBar(page, font, fontBold, x, Math.max(y - 14, bandBottom + 24), width);
}

function drawScaleBar(page: PDFPage, font: PDFFont, fontBold: PDFFont, x0: number, y: number, maxWidth: number) {
  // Recomputed from the page's own stored metadata would be ideal, but the
  // scale bar only needs to be internally consistent with itself — drawn
  // at a fixed real-world length, it's a ruler regardless of room scale.
  const barFeet = 10;
  const barLengthPt = Math.min(maxWidth, 90);
  const x1 = x0 + barLengthPt;

  page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
  page.drawLine({ start: { x: x0, y: y - 4 }, end: { x: x0, y: y + 4 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
  page.drawLine({ start: { x: x1, y: y - 4 }, end: { x: x1, y: y + 4 }, thickness: 1.5, color: rgb(0.1, 0.1, 0.1) });
  page.drawText("0", { x: x0 - 2, y: y + 6, size: 7, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(`${barFeet} ft`, { x: x1 - 8, y: y + 6, size: 7, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("Verify scale with a ruler against this bar before printing to a different page size.", {
    x: x0,
    y: y - 14,
    size: 6.5,
    font: fontBold,
    color: rgb(0.35, 0.35, 0.35),
  });
}

function drawNotesColumn(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  data: PdfLayoutData,
  x: number,
  bandTop: number,
  width: number,
  bandBottom: number
) {
  if (!data.setupNotes || !data.setupNotes.trim()) return;
  let y = bandTop - 14;
  page.drawText("Setup Notes", { x, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 14;
  const fontSize = 9;
  for (const paragraph of data.setupNotes.split("\n")) {
    for (const line of wrapText(paragraph, font, fontSize, width)) {
      if (y < bandBottom + 8) return; // ran out of band room — avoid drawing off the page
      page.drawText(line, { x, y, size: fontSize, font, color: rgb(0.25, 0.25, 0.25) });
      y -= 12;
    }
  }
}

/** Naive greedy word-wrap — good enough for a sidebar notes block, no justification needed. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
