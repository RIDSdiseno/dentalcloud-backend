ALTER TABLE "treatment_plans"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "startedByUserId" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedByUserId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "treatment_plans_createdByUserId_idx" ON "treatment_plans"("createdByUserId");
CREATE INDEX "treatment_plans_startedByUserId_idx" ON "treatment_plans"("startedByUserId");
CREATE INDEX "treatment_plans_completedByUserId_idx" ON "treatment_plans"("completedByUserId");

ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
