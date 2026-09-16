-- CreateTable
CREATE TABLE "rx_order_clinics" (
    "id" TEXT NOT NULL,
    "dimageOrderId" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "patientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rx_order_clinics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rx_order_clinics_dimageOrderId_key" ON "rx_order_clinics"("dimageOrderId");

-- CreateIndex
CREATE INDEX "rx_order_clinics_clinicaId_idx" ON "rx_order_clinics"("clinicaId");
