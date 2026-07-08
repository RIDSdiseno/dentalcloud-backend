-- CreateTable
CREATE TABLE "clinical_documents" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_documents_patientId_category_createdAt_idx" ON "clinical_documents"("patientId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
