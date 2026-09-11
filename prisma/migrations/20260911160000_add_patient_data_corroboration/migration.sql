-- AlterTable
ALTER TABLE "patients" ADD COLUMN "datosCorroboradosAt" TIMESTAMP(3);
ALTER TABLE "patients" ADD COLUMN "datosCorroboradosPorId" TEXT;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_datosCorroboradosPorId_fkey" FOREIGN KEY ("datosCorroboradosPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
