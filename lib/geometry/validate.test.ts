import { describe, it, expect } from "vitest";
import { validateLayout } from "@/lib/geometry/validate";
import { EquipmentItem, LayoutObject } from "@/lib/geometry/types";

const roomBoundary = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
];

const roundTableItem: EquipmentItem = {
  id: "eq-round-60",
  name: '60" Round Table',
  category: "table",
  shape: "circle",
  diameterIn: 60,
  clearanceIn: 24,
  rotatable: true,
  color: "#c8a76b",
};

const chairItem: EquipmentItem = {
  id: "eq-chair",
  name: "Chair",
  category: "chair",
  shape: "rect",
  widthIn: 18,
  lengthIn: 20,
  clearanceIn: 6,
  rotatable: true,
  color: "#5b7a9d",
};

function table(id: string, x: number, y: number): LayoutObject {
  return {
    id,
    equipmentItemId: roundTableItem.id,
    parentObjectId: null,
    shape: "circle",
    x,
    y,
    rotation: 0,
    diameterIn: 60,
    zIndex: 1,
  };
}

function chairAt(id: string, parentId: string, x: number, y: number): LayoutObject {
  return {
    id,
    equipmentItemId: chairItem.id,
    parentObjectId: parentId,
    shape: "rect",
    x,
    y,
    rotation: 0,
    widthIn: 18,
    lengthIn: 20,
    zIndex: 2,
  };
}

describe("validateLayout", () => {
  it("reports no issues for two well-separated tables", () => {
    const units = [
      { object: table("t1", 200, 200), item: roundTableItem },
      { object: table("t2", 800, 800), item: roundTableItem },
    ];
    expect(validateLayout(units, roomBoundary)).toHaveLength(0);
  });

  it("reports a hard collision when two bare tables overlap", () => {
    const units = [
      { object: table("t1", 200, 200), item: roundTableItem },
      { object: table("t2", 230, 200), item: roundTableItem }, // 30in apart, radius 30 each -> overlap
    ];
    const issues = validateLayout(units, roomBoundary);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("collision");
    expect(issues[0].severity).toBe("error");
  });

  it("reports a room-boundary error when a table extends past the wall", () => {
    const units = [{ object: table("t1", 10, 200), item: roundTableItem }]; // radius 30, cx 10 -> pokes past x=0
    const issues = validateLayout(units, roomBoundary);
    expect(issues.some((i) => i.type === "room_boundary")).toBe(true);
  });

  it("flags a clearance warning when two tables' chair footprints overlap even though the bare tables don't", () => {
    // Chair coordinates are RELATIVE to their parent table's center (see
    // lib/geometry/placement.ts), which is what lets Konva's Group
    // transform move/rotate them together with the table for free — so a
    // chair 44in to the +x side of its table is stored as (44, 0)
    // regardless of where the table itself sits in the room.
    const t1 = table("t1", 200, 200);
    const t2 = table("t2", 290, 200);
    const c1 = chairAt("c1", "t1", 44, 0); // sits on t1's side facing t2
    const c2 = chairAt("c2", "t2", -44, 0); // sits on t2's side facing t1

    const units = [
      { object: t1, item: roundTableItem, children: [{ object: c1, item: chairItem }] },
      { object: t2, item: roundTableItem, children: [{ object: c2, item: chairItem }] },
    ];
    const issues = validateLayout(units, roomBoundary);
    expect(issues.some((i) => i.type === "clearance_conflict")).toBe(true);
    expect(issues.every((i) => i.type !== "collision")).toBe(true);
  });
});
