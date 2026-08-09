/*
  Warnings:

  - Added the required column `passwordHash` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Temporary default so this doesn't fail against existing seeded rows; the
-- seed script immediately overwrites every user's passwordHash with a real
-- scrypt hash afterward (see prisma/seed.ts). No row is meant to keep this
-- placeholder value in a real deployment.
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT NOT NULL DEFAULT 'unset';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
