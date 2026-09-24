-- CreateIndex
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_usedAt_idx" ON "PasswordResetToken"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "Invitation_familyId_status_expiresAt_idx" ON "Invitation"("familyId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Event_familyId_status_startsAtUtc_idx" ON "Event"("familyId", "status", "startsAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMember_familyId_userId_key" ON "FamilyMember"("familyId", "userId");
