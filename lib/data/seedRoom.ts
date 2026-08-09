import { RoomTemplate } from "@/lib/geometry/types";
import { feetToInches } from "@/lib/geometry/scale";

// NOTE: superseded by the database now that persistence is wired up
// (see prisma/seed.ts, which seeds identical values, and
// GET /api/layouts/[id] which serves them to the editor). Kept here as the
// canonical reference for these values and for any future script/test that
// wants the MVP fixtures without hitting a real database.
//
// The MVP's single accurately-measured test room.
// 60ft x 40ft rectangular ballroom, boundary origin at top-left (0,0) in inches.
const widthFt = 60;
const lengthFt = 40;
const widthIn = feetToInches(widthFt);
const lengthIn = feetToInches(lengthFt);

export const testRoom: RoomTemplate = {
  id: "room-test-ballroom",
  venueName: "Great Plains Hospitality",
  roomName: "Grand Ballroom (Test Room)",
  widthFt,
  lengthFt,
  ceilingHeightFt: 16,
  boundary: [
    { x: 0, y: 0 },
    { x: widthIn, y: 0 },
    { x: widthIn, y: lengthIn },
    { x: 0, y: lengthIn },
  ],
};
