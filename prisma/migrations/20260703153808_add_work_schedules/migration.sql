-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'odontologo';

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "chairId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_schedules_professionalId_weekday_idx" ON "work_schedules"("professionalId", "weekday");

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_chairId_fkey" FOREIGN KEY ("chairId") REFERENCES "chairs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
