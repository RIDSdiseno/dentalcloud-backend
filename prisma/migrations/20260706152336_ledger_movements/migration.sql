-- CreateTable
CREATE TABLE "ledger_movements" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "patientId" TEXT NOT NULL,
    "treatmentPlanId" TEXT,
    "type" TEXT NOT NULL,
    "debe" INTEGER NOT NULL DEFAULT 0,
    "haber" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "paymentMethod" TEXT,
    "documentNumber" TEXT,
    "notes" TEXT,
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_movements_number_key" ON "ledger_movements"("number");

-- CreateIndex
CREATE INDEX "ledger_movements_patientId_createdAt_idx" ON "ledger_movements"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "ledger_movements" ADD CONSTRAINT "ledger_movements_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_movements" ADD CONSTRAINT "ledger_movements_treatmentPlanId_fkey" FOREIGN KEY ("treatmentPlanId") REFERENCES "treatment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_movements" ADD CONSTRAINT "ledger_movements_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
