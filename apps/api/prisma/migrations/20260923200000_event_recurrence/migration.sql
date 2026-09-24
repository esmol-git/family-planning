-- AlterTable
ALTER TABLE "Event" ADD COLUMN "recurrenceRule" TEXT;

-- CreateTable
CREATE TABLE "EventException" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceStartsAtUtc" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventException_eventId_idx" ON "EventException"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventException_eventId_occurrenceStartsAtUtc_key" ON "EventException"("eventId", "occurrenceStartsAtUtc");

-- AddForeignKey
ALTER TABLE "EventException" ADD CONSTRAINT "EventException_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
