-- CreateTable
CREATE TABLE "exam_photo_markups" (
    "id" TEXT NOT NULL,
    "examPhotoId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_photo_markups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exam_photo_markups_examPhotoId_idx" ON "exam_photo_markups"("examPhotoId");

CREATE INDEX "exam_photo_markups_patientId_idx" ON "exam_photo_markups"("patientId");

CREATE INDEX "exam_photo_markups_clinicaId_idx" ON "exam_photo_markups"("clinicaId");

ALTER TABLE "exam_photo_markups" ADD CONSTRAINT "exam_photo_markups_examPhotoId_fkey" FOREIGN KEY ("examPhotoId") REFERENCES "exam_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exam_photo_markups" ADD CONSTRAINT "exam_photo_markups_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exam_photo_markups" ADD CONSTRAINT "exam_photo_markups_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
