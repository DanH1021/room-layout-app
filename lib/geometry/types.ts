// Core geometry / layout types for the MVP editor.
// Field names deliberately mirror the Prisma models in the architecture doc
// (RoomTemplate, EquipmentItem, LayoutObject) so this in-memory layer can be
// swapped for real Prisma-backed data with minimal changes once persistence
// (build-order step 3) is wired up.

export type ShapeKind = "rect" | "circle";

export interface RoomBoundaryPoint {
  x: number; // inches
  y: number; // inches
}

export interface RoomTemplate {
  id: string;
  venueName: string;
  roomName: string;
  widthFt: number;
  lengthFt: number;
  ceilingHeightFt?: number;
  /** Simple rectangular boundary for the MVP test room, in inches, closed polygon. */
  boundary: RoomBoundaryPoint[];
}

export type EquipmentCategory =
  | "table"
  | "chair"
  | "bar"
  | "stage"
  | "dance_floor"
  | "av"
  | "decor"
  | "other";

export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  shape: ShapeKind;
  widthIn?: number;
  lengthIn?: number;
  diameterIn?: number;
  defaultChairCount?: number;
  clearanceIn: number;
  rotatable: boolean;
  color: string; // fill color for MVP rendering
}

export interface LayoutObject {
  id: string;
  equipmentItemId: string;
  parentObjectId?: string | null;
  shape: ShapeKind;
  x: number; // inches, center-origin relative to room boundary origin
  y: number; // inches
  rotation: number; // degrees
  widthIn?: number;
  lengthIn?: number;
  diameterIn?: number;
  zIndex: number;
  label?: string;
}
