import { EquipmentItem } from "@/lib/geometry/types";

// NOTE: superseded by the database now that persistence is wired up
// (see prisma/seed.ts, which seeds identical values, and
// GET /api/layouts/[id] which serves them to the editor). Kept here as the
// canonical reference for these values and for any future script/test that
// wants the MVP fixtures without hitting a real database.
//
// Seeded equipment library — 6-10 real-dimension types, per the MVP brief.
// Dimensions are true-to-life industry-standard sizes (inches).
export const equipmentLibrary: EquipmentItem[] = [
  // 60" rounds removed from the picker per Dan's request (Oct 2026) — no
  // longer part of the catering package offered to sales. Not physically
  // deleted from the database (see the equipment-removal migration note in
  // prisma/migrations), so any already-saved layout that still has one
  // keeps rendering correctly; it just can't be newly placed.
  {
    id: "eq-round-72",
    name: '72" Round Table (10-top)',
    category: "table",
    shape: "circle",
    diameterIn: 72,
    defaultChairCount: 10,
    clearanceIn: 24,
    rotatable: true,
    color: "#c8a76b",
  },
  {
    id: "eq-round-72-8top",
    name: '72" Round Table (8-top)',
    category: "table",
    shape: "circle",
    diameterIn: 72,
    defaultChairCount: 8,
    chairArrangement: "full",
    clearanceIn: 24,
    rotatable: true,
    color: "#c8a76b",
  },
  {
    id: "eq-round-72-crescent-6",
    name: '72" Round Table (6, crescent)',
    category: "table",
    shape: "circle",
    diameterIn: 72,
    defaultChairCount: 6,
    chairArrangement: "crescent",
    clearanceIn: 24,
    rotatable: true,
    color: "#c8a76b",
  },
  {
    id: "eq-round-72-crescent-8",
    name: '72" Round Table (8, crescent)',
    category: "table",
    shape: "circle",
    diameterIn: 72,
    defaultChairCount: 8,
    chairArrangement: "crescent",
    clearanceIn: 24,
    rotatable: true,
    color: "#c8a76b",
  },
  {
    id: "eq-round-72-bare",
    name: '72" Round Table (no chairs)',
    category: "table",
    shape: "circle",
    diameterIn: 72,
    defaultChairCount: 0,
    clearanceIn: 24,
    rotatable: true,
    color: "#c8a76b",
  },
  {
    id: "eq-rect-6ft",
    name: "6' Banquet Table (rect)",
    category: "table",
    shape: "rect",
    widthIn: 30,
    lengthIn: 72,
    defaultChairCount: 8,
    clearanceIn: 24,
    rotatable: true,
    color: "#b58f57",
  },
  {
    id: "eq-rect-8ft",
    name: "8' Banquet Table (rect)",
    category: "table",
    shape: "rect",
    widthIn: 30,
    lengthIn: 96,
    defaultChairCount: 10,
    clearanceIn: 24,
    rotatable: true,
    color: "#b58f57",
  },
  {
    id: "eq-rect-8ft-bare",
    name: "8' Banquet Table (no chairs)",
    category: "table",
    shape: "rect",
    widthIn: 30,
    lengthIn: 96,
    defaultChairCount: 0,
    clearanceIn: 24,
    rotatable: true,
    color: "#b58f57",
  },
  {
    // 3 x 8' tables pushed end-to-end into one continuous 24ft run, modeled
    // as a single rect (rather than 3 separate table objects) since that's
    // exactly how it looks and moves once pushed together. 28 chairs split
    // evenly along the two long sides only (14 each) per Dan's spec — zero
    // on the ends. This isn't a coincidence: generateChairsAround's existing
    // per-long-side capacity math (lengthIn / (chairWidth+2)) comes out to
    // exactly 14 per side for a 288" run with no end overflow, so no new
    // placement logic was needed for this item.
    id: "eq-rect-8ft-run3",
    name: "3 x 8' Banquet Run (28 chairs)",
    category: "table",
    shape: "rect",
    widthIn: 30,
    lengthIn: 288,
    defaultChairCount: 28,
    clearanceIn: 24,
    rotatable: true,
    color: "#b58f57",
  },
  {
    // Same idea as the 3-table run above: 2 x 8' tables = a 16ft/192" run,
    // and the existing per-long-side math comes out to exactly 9 per side
    // (18 total, none on the ends) for that length.
    id: "eq-rect-8ft-run2",
    name: "2 x 8' Banquet Run (18 chairs)",
    category: "table",
    shape: "rect",
    widthIn: 30,
    lengthIn: 192,
    defaultChairCount: 18,
    clearanceIn: 24,
    rotatable: true,
    color: "#b58f57",
  },
  {
    id: "eq-chair",
    name: "Banquet Chair",
    category: "chair",
    shape: "rect",
    widthIn: 18,
    lengthIn: 20,
    clearanceIn: 6,
    rotatable: true,
    color: "#5b7a9d",
  },
  {
    id: "eq-highboy",
    name: '30" Highboy Cocktail Table',
    category: "table",
    shape: "circle",
    diameterIn: 30,
    defaultChairCount: 0,
    clearanceIn: 18,
    rotatable: false,
    color: "#c8a76b",
  },
  {
    id: "eq-bar-6ft",
    name: "6' Straight Bar",
    category: "bar",
    shape: "rect",
    widthIn: 24,
    lengthIn: 72,
    clearanceIn: 36,
    rotatable: true,
    color: "#7a5c3e",
  },
  {
    id: "eq-stage-8x8",
    name: "8' x 8' Stage Deck",
    category: "stage",
    shape: "rect",
    widthIn: 96,
    lengthIn: 96,
    clearanceIn: 0,
    rotatable: true,
    color: "#8a8a8a",
  },
  {
    id: "eq-dancefloor-3x3",
    name: "3' x 3' Dance Floor Panel",
    category: "dance_floor",
    shape: "rect",
    widthIn: 36,
    lengthIn: 36,
    clearanceIn: 0,
    rotatable: false,
    color: "#d9d2c4",
  },
];

export function getEquipmentItem(id: string): EquipmentItem {
  const item = equipmentLibrary.find((e) => e.id === id);
  if (!item) throw new Error(`Unknown equipment item: ${id}`);
  return item;
}
