// Seeds the MVP's single test organization, room, and equipment library into
// a real Postgres database, matching lib/data/seedRoom.ts and
// lib/data/equipmentLibrary.ts (the in-memory fixtures the editor used
// before persistence was wired up).
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { instantiateEquipment } from "../lib/geometry/placement";
import { EquipmentItem } from "../lib/geometry/types";
import { hashPassword } from "../lib/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Dev-only default so a fresh `npm run db:seed` gives you a working login
// out of the box. Override with SEED_ADMIN_PASSWORD in .env for anything
// other than a throwaway local database — this value is not a secret once
// it's in this file's git history.
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

const WIDTH_FT = 60;
const LENGTH_FT = 40;
const WIDTH_IN = WIDTH_FT * 12;
const LENGTH_IN = LENGTH_FT * 12;

async function main() {
  console.log("Seeding Room Layout Program MVP data...");

  const org = await prisma.organization.upsert({
    where: { id: "org-great-plains" },
    update: {},
    create: {
      id: "org-great-plains",
      name: "Great Plains Hospitality",
    },
  });

  await prisma.user.upsert({
    where: { email: "dan.hurder@greatplainshospitality.com" },
    // Re-running the seed resets the password too — convenient in dev if you
    // forget it, but note this means the seed script is not safe to re-run
    // against a real production database without removing this.
    update: { passwordHash: hashPassword(SEED_ADMIN_PASSWORD) },
    create: {
      orgId: org.id,
      email: "dan.hurder@greatplainshospitality.com",
      name: "Dan Hurder",
      role: "administrator",
      passwordHash: hashPassword(SEED_ADMIN_PASSWORD),
    },
  });

  const room = await prisma.roomTemplate.upsert({
    where: { id: "room-test-ballroom" },
    update: {},
    create: {
      id: "room-test-ballroom",
      orgId: org.id,
      venueName: "Great Plains Hospitality",
      roomName: "Grand Ballroom (Test Room)",
      widthFt: WIDTH_FT,
      lengthFt: LENGTH_FT,
      ceilingHeightFt: 16,
      boundaryJson: [
        { x: 0, y: 0 },
        { x: WIDTH_IN, y: 0 },
        { x: WIDTH_IN, y: LENGTH_IN },
        { x: 0, y: LENGTH_IN },
      ],
    },
  });

  const equipmentItems = [
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

  for (const item of equipmentItems) {
    await prisma.equipmentItem.upsert({
      where: { id: item.id },
      update: { ...item, orgId: org.id },
      create: { ...item, orgId: org.id },
    });
  }

  const client = await prisma.client.upsert({
    where: { id: "client-sample" },
    update: {},
    create: {
      id: "client-sample",
      orgId: org.id,
      name: "Sample Client",
    },
  });

  const event = await prisma.event.upsert({
    where: { id: "event-sample" },
    update: {},
    create: {
      id: "event-sample",
      orgId: org.id,
      clientId: client.id,
      name: "Sample Event",
      eventDate: new Date(),
      roomTemplateId: room.id,
      guestCountTarget: 100,
    },
  });

  const layout = await prisma.layout.upsert({
    where: { id: "layout-sample" },
    update: {},
    create: {
      id: "layout-sample",
      eventId: event.id,
      name: "Layout 01",
      status: "draft",
      createdBy: "seed-script",
    },
  });

  // Seed a couple of starter tables so the editor isn't blank on first load
  // — only if this layout has no objects yet (don't clobber real work on
  // repeat seed runs).
  const existingObjectCount = await prisma.layoutObject.count({ where: { layoutId: layout.id } });
  if (existingObjectCount === 0) {
    const equipmentById = new Map<string, EquipmentItem>(
      equipmentItems.map((e) => [
        e.id,
        { ...e, category: e.category as EquipmentItem["category"], shape: e.shape as EquipmentItem["shape"] },
      ])
    );
    const getEquipment = (id: string) => {
      const item = equipmentById.get(id);
      if (!item) throw new Error(`Unknown equipment item: ${id}`);
      return item;
    };
    const starterObjects = [
      ...instantiateEquipment("eq-round-60", 15 * 12, 10 * 12, getEquipment),
      ...instantiateEquipment("eq-rect-6ft", 35 * 12, 10 * 12, getEquipment),
    ];
    await prisma.layoutObject.createMany({
      data: starterObjects.map((o) => ({
        id: o.id,
        layoutId: layout.id,
        equipmentItemId: o.equipmentItemId,
        parentObjectId: o.parentObjectId ?? null,
        shape: o.shape,
        x: o.x,
        y: o.y,
        rotation: o.rotation,
        widthIn: o.widthIn ?? null,
        lengthIn: o.lengthIn ?? null,
        diameterIn: o.diameterIn ?? null,
        zIndex: o.zIndex ?? 0,
        metadata: o.label ? { label: o.label } : undefined,
      })),
    });
  }

  console.log("Seeded:", {
    org: org.name,
    room: room.roomName,
    equipmentItemCount: equipmentItems.length,
    layoutId: layout.id,
  });
  console.log(
    `Login: dan.hurder@greatplainshospitality.com / ${SEED_ADMIN_PASSWORD}` +
      (process.env.SEED_ADMIN_PASSWORD ? "" : " (default — set SEED_ADMIN_PASSWORD in .env to change it)")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
