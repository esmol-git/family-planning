-- User: login required, email optional
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "login" TEXT;

UPDATE "User" SET "login" = lower("email") WHERE "login" IS NULL AND "email" IS NOT NULL;

ALTER TABLE "User" ALTER COLUMN "login" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_login_key" ON "User"("login");

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Invitation: claim existing member
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "targetMemberId" TEXT;

CREATE INDEX IF NOT EXISTS "Invitation_targetMemberId_idx" ON "Invitation"("targetMemberId");

DO $$ BEGIN
  ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_targetMemberId_fkey"
  FOREIGN KEY ("targetMemberId") REFERENCES "FamilyMember"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
