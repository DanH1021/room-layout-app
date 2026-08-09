import { describe, it, expect } from "vitest";
import { executeStructuredRequest } from "@/lib/ai/executeRequest";
import { EquipmentItem, LayoutObject } from "@/lib/geometry/types";
import { instantiateEquipment } from "@/lib/geometry/placement";
import { toShape, validateLayout } from "@/lib/geometry/validate";
import { shapesOverlap } from "@/lib/geometry/collision";
import { StructuredLayoutRequest } from "@/lib/schemas/aiRequest";

const roundTable: EquipmentItem = {
  id: "eq-round-60",
  name: '60" Round Table',
  category: "table",
  shape: "circle",
  diameterIn: 60,
  defaultChairCount: 8,
  clearanceIn: 24,
  rotatable: true,
  color: "#c8a76b",
};

const rectTable: EquipmentItem = {
  id: "eq-rect-6ft",
  name: "6' Banquet Table",
  category: "table",
  shape: "rect",
  widthIn: 30,
  lengthIn: 72,
  defaultChairCount: 8,
  clearanceIn: 24,
  rotatable: true,
  color: "#b58f57",
};

const chair: EquipmentItem = {
  id: "eq-chair",
  name: "Banquet Chair",
  category: "chair",
  shape: "rect",
  widthIn: 18,
  lengthIn: 20,
  clearanceIn: 6,
  rotatable: true,
  color: "#5b7a9d",
};

const library = new Map([
  [roundTable.id, roundTable],
  [rectTable.id, rectTable],
  [chair.id, chair],
]);
const getEquipment = (id: string): EquipmentItem => {
  const item = library.get(id);
  if (!item) throw new Error(`Unknown equipment item: ${id}`);
  return item;
};

const room = { widthFt: 60, lengthFt: 40 };

function req(partial: Partial<StructuredLayoutRequest>): StructuredLayoutRequest {
  return { intent: "test", operations: [], ...partial };
}

describe("executeStructuredRequest", () => {
  it("adds the requested count of table units, each with its default chairs", () => {
    const result = executeStructuredRequest(
      req({ operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 3 }] }),
      [],
      getEquipment,
      room
    );
    const tables = result.objects.filter((o) => !o.parentObjectId);
    const chairs = result.objects.filter((o) => o.parentObjectId);
    expect(tables).toHaveLength(3);
    expect(chairs).toHaveLength(24); // 8 chairs each
    expect(result.changeSummary.some((s) => s.includes("Added 3"))).toBe(true);
  });

  it("places added tables without any physical overlap", () => {
    const result = executeStructuredRequest(
      req({ operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 6 }] }),
      [],
      getEquipment,
      room
    );
    const tables = result.objects.filter((o) => !o.parentObjectId);
    const shapes = tables.map((t) => toShape(t, getEquipment(t.equipmentItemId)));
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        expect(shapesOverlap(shapes[i], shapes[j])).toBe(false);
      }
    }
  });

  it("places added tables far enough apart that chairs don't trigger clearance warnings either", () => {
    // Regression test: the first version of findOpenSpot only checked bare
    // table shapes, so it happily packed tables edge-to-edge and their
    // chairs ended up overlapping — caught via live browser verification,
    // not by the (too-narrow) overlap-only test above.
    const result = executeStructuredRequest(
      req({ operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 6 }] }),
      [],
      getEquipment,
      room
    );
    const units = result.objects
      .filter((o) => !o.parentObjectId)
      .map((o) => ({
        object: o,
        item: getEquipment(o.equipmentItemId),
        children: result.objects
          .filter((c) => c.parentObjectId === o.id)
          .map((c) => ({ object: c, item: getEquipment(c.equipmentItemId) })),
      }));
    const boundary = [
      { x: 0, y: 0 },
      { x: room.widthFt * 12, y: 0 },
      { x: room.widthFt * 12, y: room.lengthFt * 12 },
      { x: 0, y: room.lengthFt * 12 },
    ];
    const issues = validateLayout(units, boundary);
    expect(issues).toHaveLength(0);
  });

  it("avoids overlapping tables that were already in the room", () => {
    const existing = instantiateEquipment("eq-round-60", 15 * 12, 10 * 12, getEquipment);
    const result = executeStructuredRequest(
      req({ operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 2 }] }),
      existing,
      getEquipment,
      room
    );
    const tables = result.objects.filter((o) => !o.parentObjectId);
    expect(tables).toHaveLength(3); // 1 existing + 2 newly added
    const shapes = tables.map((t) => toShape(t, getEquipment(t.equipmentItemId)));
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        expect(shapesOverlap(shapes[i], shapes[j])).toBe(false);
      }
    }
  });

  it("clear removes every object, including chairs", () => {
    const existing = instantiateEquipment("eq-round-60", 15 * 12, 10 * 12, getEquipment);
    const result = executeStructuredRequest(req({ operations: [{ op: "clear" }] }), existing, getEquipment, room);
    expect(result.objects).toHaveLength(0);
  });

  it("removeAllOfType removes only the matching equipment type and its chairs, leaving other tables intact", () => {
    const rounds = instantiateEquipment("eq-round-60", 15 * 12, 10 * 12, getEquipment);
    const rects = instantiateEquipment("eq-rect-6ft", 40 * 12, 10 * 12, getEquipment);
    const result = executeStructuredRequest(
      req({ operations: [{ op: "removeAllOfType", equipmentItemId: "eq-round-60" }] }),
      [...rounds, ...rects],
      getEquipment,
      room
    );
    expect(result.objects.some((o) => o.equipmentItemId === "eq-round-60")).toBe(false);
    expect(result.objects.filter((o) => !o.parentObjectId && o.equipmentItemId === "eq-rect-6ft")).toHaveLength(1);
    expect(result.objects.filter((o) => o.equipmentItemId === "eq-rect-6ft" || o.parentObjectId)).not.toHaveLength(0);
  });

  it("remove deletes a specific object by id along with its chairs", () => {
    const rounds = instantiateEquipment("eq-round-60", 15 * 12, 10 * 12, getEquipment);
    const table = rounds.find((o) => !o.parentObjectId)!;
    const result = executeStructuredRequest(
      req({ operations: [{ op: "remove", objectId: table.id }] }),
      rounds,
      getEquipment,
      room
    );
    expect(result.objects).toHaveLength(0);
  });

  it("skips an 'add' operation for an unknown equipment id without throwing", () => {
    const result = executeStructuredRequest(
      req({ operations: [{ op: "add", equipmentItemId: "eq-does-not-exist", count: 2 }] }),
      [],
      getEquipment,
      room
    );
    expect(result.objects).toHaveLength(0);
    expect(result.changeSummary.some((s) => s.includes("Unknown equipment id"))).toBe(true);
  });

  it("reports a partial placement when the room runs out of open space", () => {
    // A tiny room can only fit a couple of large tables.
    const tinyRoom = { widthFt: 8, lengthFt: 8 };
    const result = executeStructuredRequest(
      req({ operations: [{ op: "add", equipmentItemId: "eq-round-60", count: 10 }] }),
      [],
      getEquipment,
      tinyRoom
    );
    const tables = result.objects.filter((o) => !o.parentObjectId);
    expect(tables.length).toBeLessThan(10);
    expect(result.changeSummary.some((s) => s.includes("Ran out of open space"))).toBe(true);
  });
});
