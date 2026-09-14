-- CreateTable
CREATE TABLE "exam_videos" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "moment" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exam_videos_patientId_moment_round_idx" ON "exam_videos"("patientId", "moment", "round");

CREATE INDEX "exam_videos_clinicaId_idx" ON "exam_videos"("clinicaId");

ALTER TABLE "exam_videos" ADD CONSTRAINT "exam_videos_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exam_videos" ADD CONSTRAINT "exam_videos_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
