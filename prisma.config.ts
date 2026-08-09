// Prisma 7 moved the datasource connection URL out of schema.prisma and into
// this config file (used by the Prisma CLI for migrate/introspect/studio).
// The runtime PrismaClient in lib/db.ts gets its own connection via a driver
// adapter, per Prisma 7's adapter-based client API.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
