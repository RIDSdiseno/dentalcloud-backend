ALTER TABLE "appointments" ADD COLUMN "confirmationToken" TEXT;
ALTER TABLE "appointments" ADD COLUMN "patientConfirmedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "appointments_confirmationToken_key" ON "appointments"("confirmationToken");
