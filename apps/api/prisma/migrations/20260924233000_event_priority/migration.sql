-- AlterEnum
CREATE TYPE "EventPriority" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "priority" "EventPriority" NOT NULL DEFAULT 'medium';
