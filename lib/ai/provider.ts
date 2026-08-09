import { EquipmentItem } from "@/lib/geometry/types";
import { StructuredLayoutRequest } from "@/lib/schemas/aiRequest";

export interface LayoutContext {
  room: { roomName: string; widthFt: number; lengthFt: number };
  equipment: EquipmentItem[];
  /** Count of currently-placed top-level units per equipment item, so the AI knows what's already in the room. */
  currentObjectCounts: Record<string, number>;
  guestCountTarget?: number;
}

/**
 * One interface, swappable providers — per architecture doc Section 3. The
 * MVP only implements `interpretLayoutRequest` via Claude; `analyzeImage`
 * and `generateInspirationImage` are reserved for a future OpenAI-backed
 * phase (room-photo import, visualization) and deliberately not built here.
 */
export interface AIProvider {
  interpretLayoutRequest(prompt: string, context: LayoutContext): Promise<StructuredLayoutRequest>;
  generateSetupNotes?(context: LayoutContext): Promise<string>;
}
