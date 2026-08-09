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
  {
    id: "eq-round-60",
    name: '60" Round Table (8-top)',
    category: "table",
    shape: "circle",
    diameterIn: 60,
    defaultChairCount: 8,
    clearanceIn: 24,
    rotatable: true,
    color: "#c8a76b",
  },
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
