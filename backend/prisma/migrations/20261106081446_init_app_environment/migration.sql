-- CreateEnum
CREATE TYPE "app_environment_name" AS ENUM ('local', 'test', 'staging', 'production');

-- CreateTable
CREATE TABLE "app_environment" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" "app_environment_name" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_environment_pkey" PRIMARY KEY ("id")
);

-- Added by hand (Prisma cannot express CHECK): the table holds exactly one row (ADR 0011).
ALTER TABLE "app_environment" ADD CONSTRAINT "app_environment_single_row" CHECK ("id" = 1);
