import { pdf } from "pdf-to-img";
import { imageSize } from "image-size";

/**
 * Fixed rasterization DPI, hard-coded rather than configurable. Scale-note
 * math downstream (px-per-inch derived from a printed "1/16" = 1'-0"" note,
 * or from a manually-drawn calibration line) depends on the background
 * image's pixel dimensions being deterministic for a given source PDF —
 * changing this later would silently invalidate any already-calibrated
 * pxPerInch values stored on existing FloorPlanUpload rows.
 */
export const RASTER_DPI = 150;

// pdfjs (which pdf-to-img wraps) treats its default render scale of 1 as 72
// user-units-per-inch (the PDF spec's default), so this is the multiplier
// that gets us to RASTER_DPI pixels per inch.
const PDF_DEFAULT_DPI = 72;

/**
 * Rasterizes page 1 of a PDF floor plan to a PNG at RASTER_DPI.
 *
 * Implementation choice: pdf-to-img (wraps pdfjs-dist's Node build). pdfjs's
 * Node canvas factory resolves `@napi-rs/canvas` at runtime, which is a
 * prebuilt native binary shipped via npm optionalDependencies — unlike
 * `node-canvas` (`canvas` on npm), it statically links its rendering
 * dependencies (no system cairo/pango required) and needs no local compile
 * step (no node-gyp), so it works in Vercel's Node.js serverless runtime.
 * `pdf-to-img` was investigated first per the task brief and turned out to
 * NOT be a pure pdfium/WASM wrapper as initially assumed — it's pdfjs-dist
 * underneath — but the actual dependency chain (pdfjs-dist + @napi-rs/canvas)
 * still satisfies the real constraint ("no native-binding compile step"),
 * and was verified end-to-end against a real sample floor-plan PDF (see
 * task report) — a working, tested solution beats a purer-in-theory one
 * that hasn't been exercised.
 */
export async function rasterizePdfFirstPage(
  pdfBuffer: Buffer
): Promise<{ png: Buffer; widthPx: number; heightPx: number }> {
  const doc = await pdf(pdfBuffer, { scale: RASTER_DPI / PDF_DEFAULT_DPI });
  try {
    const png = await doc.getPage(1);
    const dims = imageSize(new Uint8Array(png));
    if (!dims.width || !dims.height) {
      throw new Error("Rasterized PDF page produced an image with unreadable dimensions.");
    }
    return { png, widthPx: dims.width, heightPx: dims.height };
  } finally {
    await doc.destroy();
  }
}
