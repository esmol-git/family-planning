-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#5B6F64',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_familyId_idx" ON "Category"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_familyId_name_key" ON "Category"("familyId", "name");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed categories for existing families from defaults
INSERT INTO "Category" ("id", "familyId", "name", "color", "sortOrder", "active", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || f.id || d.name),
  f.id,
  d.name,
  d.color,
  d.sort_order,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Family" f
CROSS JOIN (
  VALUES
    ('Школа', '#2563EB', 0),
    ('Детский сад', '#7C3AED', 1),
    ('Футбол', '#16A34A', 2),
    ('Спорт', '#0D9488', 3),
    ('Кружок', '#CA8A04', 4),
    ('Врач', '#DC2626', 5),
    ('Работа', '#475569', 6),
    ('Поездка', '#EA580C', 7),
    ('Праздник', '#DB2777', 8),
    ('Домашние дела', '#65A30D', 9),
    ('Другое', '#5B6F64', 10)
) AS d(name, color, sort_order);

-- Add categoryId nullable first
ALTER TABLE "Event" ADD COLUMN "categoryId" TEXT;

-- Map old enum values to category names
UPDATE "Event" e
SET "categoryId" = c.id
FROM "Category" c
WHERE c."familyId" = e."familyId"
  AND c.name = CASE e.category::text
    WHEN 'school' THEN 'Школа'
    WHEN 'kindergarten' THEN 'Детский сад'
    WHEN 'football' THEN 'Футбол'
    WHEN 'sport' THEN 'Спорт'
    WHEN 'club' THEN 'Кружок'
    WHEN 'doctor' THEN 'Врач'
    WHEN 'work' THEN 'Работа'
    WHEN 'trip' THEN 'Поездка'
    WHEN 'holiday' THEN 'Праздник'
    WHEN 'chores' THEN 'Домашние дела'
    ELSE 'Другое'
  END;

-- Fallback any unmapped events to «Другое»
UPDATE "Event" e
SET "categoryId" = c.id
FROM "Category" c
WHERE e."categoryId" IS NULL
  AND c."familyId" = e."familyId"
  AND c.name = 'Другое';

ALTER TABLE "Event" ALTER COLUMN "categoryId" SET NOT NULL;

ALTER TABLE "Event" DROP COLUMN "category";

DROP TYPE "EventCategory";

CREATE INDEX "Event_categoryId_idx" ON "Event"("categoryId");

ALTER TABLE "Event" ADD CONSTRAINT "Event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
