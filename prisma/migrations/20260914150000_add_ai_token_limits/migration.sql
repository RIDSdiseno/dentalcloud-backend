-- AlterTable
ALTER TABLE "clinicas" ADD COLUMN "aiTokenLimitMonthly" INTEGER NOT NULL DEFAULT 100000;

-- CreateTable
CREATE TABLE "ai_token_usages" (
    "id" TEXT NOT NULL,
    "clinicaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "tokensUsados" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_token_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_token_usages_clinicaId_periodo_key" ON "ai_token_usages"("clinicaId", "periodo");

ALTER TABLE "ai_token_usages" ADD CONSTRAINT "ai_token_usages_clinicaId_fkey" FOREIGN KEY ("clinicaId") REFERENCES "clinicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
