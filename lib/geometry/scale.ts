// Real-world <-> screen scale conversion. Everything in the data model is
// stored in inches; the canvas renders at pixelsPerInch * zoom.

export const BASE_PIXELS_PER_INCH = 2; // at zoom = 1, 1 inch = 2px (48px per foot)

export function inchesToPx(inches: number, zoom: number): number {
  return inches * BASE_PIXELS_PER_INCH * zoom;
}

export function pxToInches(px: number, zoom: number): number {
  return px / (BASE_PIXELS_PER_INCH * zoom);
}

export function feetToInches(feet: number): number {
  return feet * 12;
}

export function inchesToFeetLabel(inches: number): string {
  const feet = Math.floor(inches / 12);
  const remInches = Math.round(inches - feet * 12);
  if (remInches === 0) return `${feet}'`;
  return `${feet}'${remInches}"`;
}
