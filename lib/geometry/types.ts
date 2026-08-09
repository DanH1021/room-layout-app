// Core geometry / layout types for the MVP editor.
// Field names deliberately mirror the Prisma models in the architecture doc
// (RoomTemplate, EquipmentItem, LayoutObject) so this in-memory layer can be
// swapped for real Prisma-backed data with minimal changes once persistence
// (build-order step 3) is wired up.

import { Shape } from "@/lib/geometry/collision";

export type ShapeKind = "rect" | "circle";

export interface RoomBoundaryPoint {
  x: number; // inches
  y: number; // inches
}

export interface RoomFeatureRecord {
  id: string;
  type: string;
  shape: ShapeKind | "polygon";
  x: number;
  y: number;
  widthIn?: number | null;
  lengthIn?: number | null;
  diameterIn?: number | null;
  rotation: number;
  blocksPlacement: boolean;
  metadata?: { polygonPoints?: RoomBoundaryPoint[] } | null;
}

export interface RoomTemplate {
  id: string;
  venueName: string;
  roomName: string;
  widthFt: number;
  lengthFt: number;
  ceilingHeightFt?: number;
  /** Boundary polygon, in inches — may be an irregular (including concave) shape. */
  boundary: RoomBoundaryPoint[];
  /** Fixed architectural obstacles (columns, permanent bars, stairs, etc.) traced from an uploaded floor plan. Empty for rooms created the old manual way. */
  features?: RoomFeatureRecord[];
  /** Source floor-plan image shown as a background layer under the boundary/obstacles, if this room was created via upload. */
  backgroundImageUrl?: string | null;
  backgroundImageWidthPx?: number | null;
  backgroundImageHeightPx?: number | null;
  backgroundImagePxPerInch?: number | null;
}

/** Converts a persisted RoomFeature row into the geometry engine's Shape + Obstacle representation, per lib/geometry/collision.ts. */
export function roomFeatureToObstacle(feature: RoomFeatureRecord): Obstacle {
  const shape: Shape =
    feature.shape === "circle"
      ? { kind: "circle", cx: feature.x, cy: feature.y, radius: (feature.diameterIn ?? 12) / 2 }
      : feature.shape === "polygon"
        ? { kind: "polygon", points: feature.metadata?.polygonPoints ?? [] }
        : {
            kind: "rect",
            cx: feature.x,
            cy: feature.y,
            width: feature.widthIn ?? 12,
            height: feature.lengthIn ?? 12,
            rotation: feature.rotation,
          };
  return { id: feature.id, name: feature.type, shape, blocksPlacement: feature.blocksPlacement };
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

export interface Obstacle {
  id: string;
  name: string;
  shape: Shape;
  blocksPlacement: boolean;
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
